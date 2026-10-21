"""Guarded updates of one imported game site; never replace the shared root config."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlparse


def run(args, text=None):
    return subprocess.run(args, input=text, text=True, capture_output=True, check=True).stdout


def protected_routes(servers, host):
    """Ignore Caddy's generated group names, preserving their equality relationships."""
    result = {}
    groups = {}

    def normalize(value):
        if isinstance(value, list):
            return [normalize(x) for x in value]
        if isinstance(value, dict):
            return {k: groups.setdefault(v, 'group' + str(len(groups))) if k == 'group'
                    else normalize(v) for k, v in value.items()}
        return value

    for name, server in servers.items():
        routes = []
        for route in server.get('routes', []):
            hosts = {h for m in route.get('match', []) for h in m.get('host', [])}
            if host in hosts:
                if hosts != {host}:
                    raise ValueError('target_host_shared_route')
                continue
            routes.append(route)
        result[name] = normalize(routes)
    return result


def shared_files(directory, managed):
    result = {}
    for file in sorted(directory.rglob('*')):
        if file.is_symlink():
            raise ValueError('gateway_symlink_not_allowed')
        if file.is_file() and file != managed:
            result[str(file.relative_to(directory))] = hashlib.sha256(file.read_bytes()).hexdigest()
    return result


def require_networks(actual, configured):
    if set(actual) != set(configured):
        raise ValueError('shared_gateway_network_not_declared')


def private_directory(directory, repository):
    directory = directory.resolve(strict=True)
    if directory == repository or repository in directory.parents:
        raise ValueError('gateway_directory_must_be_outside_repository')
    return directory


class Gateway:
    def __init__(self, files, envfile):
        self.repo = Path(__file__).resolve().parent.parent
        self.compose = ['docker', 'compose']
        for file in files:
            self.compose += ['-f', str(Path(file).resolve())]
        self.compose += ['--env-file', str(Path(envfile).resolve())]
        self.config = json.loads(run(self.compose + ['config', '--format', 'json']))
        service = self.config['services']['gateway']
        mounts = [m for m in service['volumes'] if m['target'] == '/etc/caddy']
        if len(mounts) != 1 or mounts[0]['type'] != 'bind' or not mounts[0]['read_only']:
            raise ValueError('private_gateway_mount_required')
        self.directory = private_directory(Path(mounts[0]['source']), self.repo)
        self.game_id = self.config['services']['game']['environment']['GAME_ID']
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,31}', self.game_id):
            raise ValueError('invalid_game_id')
        self.host = urlparse(self.config['services']['game']['environment']['PUBLIC_ORIGIN']).hostname
        self.managed = self.directory / (self.game_id + '.caddy')
        self.root = self.directory / 'Caddyfile'
        self.import_line = 'import /etc/caddy/' + self.managed.name
        self.original_root = self.root.read_text()
        if self.original_root.splitlines().count(self.import_line) != 1:
            raise ValueError('explicit_managed_import_required')
        self.fingerprints = shared_files(self.directory, self.managed)
        self.current = self.inspect()
        actual_mounts = [m for m in self.current['Mounts'] if m['Destination'] == '/etc/caddy']
        if len(actual_mounts) != 1 or Path(actual_mounts[0]['Source']).resolve() != self.directory:
            raise ValueError('runtime_gateway_mount_mismatch')
        configured = {self.config['networks'][k]['name'] for k in service['networks']}
        require_networks(self.current['NetworkSettings']['Networks'], configured)
        self.protected = protected_routes(self.loaded(), self.host)
        self.assert_files()

    def inspect(self):
        ids = run(self.compose + ['ps', '-q', 'gateway']).split()
        if len(ids) != 1:
            raise ValueError('one_running_gateway_required')
        return json.loads(run(['docker', 'inspect', ids[0]]))[0]

    def loaded(self):
        return json.loads(run(['docker', 'exec', self.current['Id'], 'wget', '-qO-',
                              'http://127.0.0.1:2019/config/apps/http/servers']))

    def assert_files(self):
        if shared_files(self.directory, self.managed) != self.fingerprints:
            raise ValueError('non_target_gateway_files_changed')

    def validate(self, candidate):
        self.assert_files()
        # Stage only in the container's /tmp; the live files are untouched until validation passes.
        staged = '/tmp/skyline-managed-next.caddy'
        run(['docker', 'exec', '-i', self.current['Id'], 'sh', '-c', 'cat > ' + staged], candidate)
        root = self.original_root.replace(self.import_line, 'import ' + staged)
        adapted = json.loads(run(['docker', 'exec', '-i', self.current['Id'], 'caddy', 'adapt',
                                  '--config', '-', '--adapter', 'caddyfile'], root))
        if protected_routes(adapted['apps']['http']['servers'], self.host) != self.protected:
            raise ValueError('non_target_gateway_routes_changed')

    def apply(self, phase):
        template = (self.repo / 'deploy/Caddyfile').read_text()
        if phase == 'maintenance':
            candidate = '{$GAME_HOST} {\n header Cache-Control no-store\n respond "Maintenance" 503\n}\n'
        elif phase == 'admission':
            candidate = template.replace('    @game path',
                '    @admission path /' + self.game_id + '/api/session /' + self.game_id + '/api/runs\n'
                '    handle @admission {\n        header Cache-Control no-store\n'
                '        respond "Maintenance" 503\n    }\n    @game path')
        else:
            candidate = template
        self.validate(candidate)
        self.assert_files()
        # Directory mount permits an atomic replacement of this one imported file.
        fd, temporary = tempfile.mkstemp(prefix='.' + self.game_id, dir=self.directory)
        try:
            with os.fdopen(fd, 'w') as file:
                file.write(candidate)
            os.chmod(temporary, 0o644)
            os.replace(temporary, self.managed)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        run(['docker', 'exec', self.current['Id'], 'caddy', 'reload',
             '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
        self.verify()

    def verify(self):
        self.assert_files()
        if protected_routes(self.loaded(), self.host) != self.protected:
            raise ValueError('non_target_loaded_routes_changed')
        configured = {self.config['networks'][k]['name']
                      for k in self.config['services']['gateway']['networks']}
        require_networks(self.current['NetworkSettings']['Networks'], configured)

    def recreate(self):
        self.validate(self.managed.read_text())
        run(self.compose + ['up', '-d', '--no-build', '--no-deps', '--force-recreate',
                            '--wait', '--wait-timeout', '90', 'gateway'])
        self.current = self.inspect()
        self.verify()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', action='append', required=True, help='Every actual Compose file, in order')
    parser.add_argument('--env-file', required=True)
    parser.add_argument('action', choices=['check', 'admission', 'maintenance', 'open', 'recreate'])
    args = parser.parse_args()
    gateway = Gateway(args.file, args.env_file)
    if args.action == 'recreate':
        gateway.recreate()
    elif args.action == 'check':
        gateway.validate(gateway.managed.read_text())
        gateway.verify()
    else:
        gateway.apply(args.action)
    print(json.dumps({'action': args.action, 'otherRoutesPreserved': True,
                      'sharedFilesPreserved': True, 'networksDeclared': True}))


if __name__ == '__main__':
    main()
