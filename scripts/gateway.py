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


def atomic_text(destination, text, mode=0o644):
    fd, temporary = tempfile.mkstemp(prefix='.' + destination.name, dir=destination.parent)
    try:
        with os.fdopen(fd, 'w') as file:
            file.write(text)
        os.chmod(temporary, mode)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


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
        self.configured = {self.config['networks'][k]['name'] for k in service['networks']}
        self.checkpoint = self.directory.parent / (self.directory.name + '-' + self.game_id + '-good.json')
        self.binding = {'gameId': self.game_id, 'host': self.host, 'directory': str(self.directory),
                        'networks': sorted(self.configured), 'gateway': service}
        self.current = self.inspect()
        self.assert_runtime()
        if self.running():
            self.protected = protected_routes(self.loaded(), self.host)
        else:
            self.protected = self.read_good()['protected']
        self.assert_files()

    def inspect(self):
        ids = run(self.compose + ['ps', '-aq', 'gateway']).split()
        if not ids:
            return None
        if len(ids) > 1:
            raise ValueError('one_gateway_required')
        return json.loads(run(['docker', 'inspect', ids[0]]))[0]

    def running(self):
        return self.current is not None and self.current['State']['Running']

    def assert_runtime(self):
        if self.current is None:
            return
        mounts = [m for m in self.current['Mounts'] if m['Destination'] == '/etc/caddy']
        if len(mounts) != 1 or mounts[0]['RW'] or Path(mounts[0]['Source']).resolve() != self.directory:
            raise ValueError('runtime_gateway_mount_mismatch')
        require_networks(self.current['NetworkSettings']['Networks'], self.configured)

    def loaded(self):
        return json.loads(run(['docker', 'exec', self.current['Id'], 'wget', '-qO-',
                              'http://127.0.0.1:2019/config/apps/http/servers']))

    def assert_files(self):
        if shared_files(self.directory, self.managed) != self.fingerprints:
            raise ValueError('non_target_gateway_files_changed')

    def validate(self, candidate):
        self.assert_files()
        # Inline only this candidate into a temporary stdin config, never into live files.
        root = self.original_root.replace(self.import_line, candidate)
        if self.running():
            engine = ['docker', 'exec', '-i', self.current['Id'], 'caddy']
        else:
            # Same image, user, read-only mounts, environment and networks; no listening ports.
            engine = self.compose + ['run', '--rm', '--no-deps', '-T', '--entrypoint', 'caddy', 'gateway']
        adapted = json.loads(run(engine + ['adapt', '--config', '-', '--adapter', 'caddyfile'], root))
        if protected_routes(adapted['apps']['http']['servers'], self.host) != self.protected:
            raise ValueError('non_target_gateway_routes_changed')
        run(engine + ['validate', '--config', '-'], json.dumps(adapted))
        self.assert_files()
        return adapted['apps']['http']['servers']

    def read_good(self):
        try:
            good = json.loads(self.checkpoint.read_text())
        except (OSError, ValueError) as error:
            raise ValueError('known_good_game_config_required') from error
        if good['binding'] != self.binding or good['sharedFiles'] != self.fingerprints:
            raise ValueError('known_good_gateway_context_mismatch')
        return good

    def remember_good(self):
        if not self.running():
            raise ValueError('gateway_stopped_use_recover')
        candidate = self.managed.read_text()
        servers = self.validate(candidate)
        if protected_routes(servers, '') != protected_routes(self.loaded(), ''):
            raise ValueError('loaded_game_config_does_not_match_disk')
        good = {'binding': self.binding, 'sharedFiles': self.fingerprints,
                'protected': self.protected, 'game': candidate}
        atomic_text(self.checkpoint, json.dumps(good, ensure_ascii=False, indent=2), 0o600)
        return good

    def reload(self):
        run(['docker', 'exec', self.current['Id'], 'caddy', 'reload',
             '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])

    def apply(self, phase):
        previous = self.remember_good()
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
        atomic_text(self.managed, candidate)
        try:
            self.reload()
            self.verify()
            self.remember_good()
        except Exception:
            # Restore only this game, including a previous maintenance phase if applicable.
            self.assert_files()
            atomic_text(self.managed, previous['game'])
            self.current = self.inspect()
            if self.running():
                self.reload()
                self.verify()
            raise

    def verify(self):
        self.assert_files()
        self.current = self.inspect()
        self.assert_runtime()
        if not self.running():
            raise ValueError('gateway_stopped_use_recover')
        if protected_routes(self.loaded(), self.host) != self.protected:
            raise ValueError('non_target_loaded_routes_changed')

    def recreate(self):
        self.remember_good()
        run(self.compose + ['up', '-d', '--no-build', '--no-deps', '--force-recreate',
                            '--wait', '--wait-timeout', '90', 'gateway'])
        self.current = self.inspect()
        self.verify()
        self.remember_good()

    def recover(self):
        if self.running():
            raise ValueError('recover_requires_stopped_gateway')
        good = self.read_good()
        self.validate(good['game'])
        self.assert_files()
        atomic_text(self.managed, good['game'])
        run(self.compose + ['up', '-d', '--no-build', '--no-deps', '--force-recreate',
                            '--wait', '--wait-timeout', '90', 'gateway'])
        self.current = self.inspect()
        self.verify()
        self.remember_good()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', action='append', required=True, help='Every actual Compose file, in order')
    parser.add_argument('--env-file', required=True)
    parser.add_argument('action', choices=['check', 'admission', 'maintenance', 'open', 'recreate', 'recover'])
    args = parser.parse_args()
    gateway = Gateway(args.file, args.env_file)
    if args.action == 'recreate':
        gateway.recreate()
    elif args.action == 'recover':
        gateway.recover()
    elif args.action == 'check':
        gateway.verify()
        gateway.remember_good()
    else:
        gateway.apply(args.action)
    print(json.dumps({'action': args.action, 'otherRoutesPreserved': True,
                      'sharedFilesPreserved': True, 'networksDeclared': True}))


if __name__ == '__main__':
    main()
