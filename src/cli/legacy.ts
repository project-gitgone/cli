export const LEGACY_NAMES: Record<string, string> = {
  passwd: 'account password',
  activate: 'account activate',
  link: 'init',
  'admin setup': 'login',
  'admin users': 'user',
  'admin users list': 'user list',
  'admin users create': 'user invite',
  'admin users reset': 'user reset',
  'admin users set-role': 'user role',
  admin: 'user',
  tokens: 'token',
  'tokens list': 'token list',
  'tokens create': 'token create',
  'tokens delete': 'token revoke',
  keys: 'key',
  'keys share': 'key share',
  'keys fingerprint': 'key fingerprint',
  'keys forget': 'key forget',
  roles: 'role',
  'roles list': 'role list',
  'roles show': 'role show',
  'roles create': 'role create',
  'roles delete': 'role delete',
  'team list-members': 'team members',
  'team add-member': 'team add',
  'team remove-member': 'team remove',
  'team set-role': 'team role',
  'project set-policy': 'project policy',
  'config local-set': 'config set --local',
  'config local-get': 'config get --local',
};

export function renamedCommand(words: string[]): { from: string; to: string } | null {
  for (let length = Math.min(words.length, 3); length > 0; length--) {
    const from = words.slice(0, length).join(' ');
    if (LEGACY_NAMES[from]) return { from, to: LEGACY_NAMES[from] };
  }
  return null;
}
