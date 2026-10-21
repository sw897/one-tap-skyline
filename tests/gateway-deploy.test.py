import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('gateway', Path(__file__).resolve().parents[1] / 'scripts/gateway.py')
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


def routes(group='group1', backend='other:8080'):
    return {'srv0': {'routes': [
        {'match': [{'host': ['game.example.com']}], 'handle': [{'handler': 'static_response', 'status_code': 503}]},
        {'match': [{'host': ['other.example.com']}], 'handle': [{'group': group, 'upstream': backend}, {'group': group}]}
    ]}}


class GatewayGuards(unittest.TestCase):
    def test_generated_group_names_do_not_hide_or_report_false_route_changes(self):
        a = gateway.protected_routes(routes(), 'game.example.com')
        self.assertEqual(a, gateway.protected_routes(routes('group99'), 'game.example.com'))
        self.assertNotEqual(a, gateway.protected_routes(routes(backend='wrong:8080'), 'game.example.com'))

    def test_lost_other_host_is_detected(self):
        before = routes()
        after = json.loads(json.dumps(before))
        after['srv0']['routes'].pop()
        self.assertNotEqual(gateway.protected_routes(before, 'game.example.com'),
                            gateway.protected_routes(after, 'game.example.com'))

    def test_route_group_relationships_are_preserved(self):
        before = routes()
        after = json.loads(json.dumps(before))
        after['srv0']['routes'][1]['handle'][1]['group'] = 'different'
        self.assertNotEqual(gateway.protected_routes(before, 'game.example.com'),
                            gateway.protected_routes(after, 'game.example.com'))

    def test_multi_host_route_cannot_be_treated_as_one_game(self):
        value = routes()
        value['srv0']['routes'][0]['match'][0]['host'].append('other.example.com')
        with self.assertRaisesRegex(ValueError, 'target_host_shared_route'):
            gateway.protected_routes(value, 'game.example.com')

    def test_networks_must_match_in_both_directions(self):
        gateway.require_networks(['edge', 'game', 'shared'], ['edge', 'game', 'shared'])
        for actual, configured in [(['edge', 'game', 'shared'], ['edge', 'game']),
                                   (['edge', 'game'], ['edge', 'game', 'shared'])]:
            with self.assertRaisesRegex(ValueError, 'shared_gateway_network_not_declared'):
                gateway.require_networks(actual, configured)

    def test_shared_files_are_checked_but_managed_site_can_change(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            root, managed = directory / 'Caddyfile', directory / 'skyline.caddy'
            root.write_text('import /etc/caddy/skyline.caddy\n')
            managed.write_text('game.example.com {}')
            before = gateway.shared_files(directory, managed)
            managed.write_text('game.example.com { respond 503 }')
            self.assertEqual(before, gateway.shared_files(directory, managed))
            root.write_text('lost other site')
            self.assertNotEqual(before, gateway.shared_files(directory, managed))

    def test_private_config_cannot_live_in_checkout(self):
        repo = Path(__file__).resolve().parents[1]
        with self.assertRaisesRegex(ValueError, 'gateway_directory_must_be_outside_repository'):
            gateway.private_directory(repo / 'deploy', repo)

    def test_atomic_game_and_checkpoint_files_have_separate_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            game, checkpoint = root / 'skyline.caddy', root / 'good.json'
            gateway.atomic_text(game, 'valid game')
            gateway.atomic_text(checkpoint, '{"game":"valid game"}', 0o600)
            self.assertEqual(game.read_text(), 'valid game')
            self.assertEqual(json.loads(checkpoint.read_text())['game'], 'valid game')
            self.assertEqual(sorted(p.name for p in root.iterdir()), ['good.json', 'skyline.caddy'])

    def test_stopped_recovery_requires_matching_shared_context(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = object.__new__(gateway.Gateway)
            instance.checkpoint = Path(directory) / 'good.json'
            instance.binding = {'gameId': 'skyline'}
            instance.fingerprints = {'Caddyfile': 'original'}
            with self.assertRaisesRegex(ValueError, 'known_good_game_config_required'):
                instance.read_good()
            instance.checkpoint.write_text(json.dumps({'binding': instance.binding,
                                                      'sharedFiles': {'Caddyfile': 'changed'}}))
            with self.assertRaisesRegex(ValueError, 'known_good_gateway_context_mismatch'):
                instance.read_good()

    def test_verify_refreshes_networks_instead_of_using_constructor_snapshot(self):
        instance = object.__new__(gateway.Gateway)
        instance.assert_files = Mock()
        instance.current = {'NetworkSettings': {'Networks': ['edge', 'game', 'shared']}}
        changed = {'NetworkSettings': {'Networks': ['edge', 'game']}}
        instance.inspect = Mock(return_value=changed)
        instance.assert_runtime = Mock(side_effect=ValueError('shared_gateway_network_not_declared'))
        with self.assertRaisesRegex(ValueError, 'shared_gateway_network_not_declared'):
            instance.verify()
        self.assertIs(instance.current, changed)


if __name__ == '__main__':
    unittest.main()
