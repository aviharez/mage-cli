import type { SidebarSection } from '@/constants/sidebar';

export type SettingsPageSlug =
  | 'projects'
  | 'remote-instances'
  | 'agents'
  | 'behavior'
  | 'commands'
  | 'mcp'
  | 'plugins'
  | 'skills.installed'
  | 'skills.catalog'
  | 'git'
  | 'gitlab'
  | 'appearance'
  | 'chat'
  | 'shortcuts'
  | 'sessions'
  | 'magic-prompts'
  | 'snippets'
  | 'notifications'
  | 'proxy'
  | 'tunnel'
  | 'about';

type SettingsPageGroup =
  | 'appearance'
  | 'projects'
  | 'general'
  | 'mage'
  | 'git'
  | 'skills'
  | 'advanced';

export interface SettingsRuntimeContext {
  isVSCode: boolean;
  isWeb: boolean;
  isDesktop: boolean;
  isMobile: boolean;
}

export interface SettingsPageMeta {
  slug: SettingsPageSlug;
  title: string;
  group: SettingsPageGroup;
  kind: 'single' | 'split';
  description?: string;
  keywords?: string[];
  isAvailable?: (ctx: SettingsRuntimeContext) => boolean;
}

// Voice settings are intentionally hidden for this Mage distribution.
export const SETTINGS_PAGE_METADATA: readonly SettingsPageMeta[] = [
  {
    slug: 'projects',
    title: 'Projects',
    group: 'projects',
    kind: 'split',
    keywords: ['project', 'projects', 'worktree', 'worktrees', 'repo', 'repository', 'directory'],
  },
  {
    slug: 'remote-instances',
    title: 'Remote Instances',
    group: 'projects',
    kind: 'single',
    keywords: ['ssh', 'remote', 'instances', 'tunnels', 'forwarding', 'connection'],
    isAvailable: (ctx) => !ctx.isVSCode && !ctx.isDesktop,
  },
  {
    slug: 'agents',
    title: 'Agents',
    group: 'mage',
    kind: 'split',
    keywords: ['agent', 'agents', 'prompts', 'tools', 'permissions'],
  },
  {
    slug: 'behavior',
    title: 'Behavior',
    group: 'mage',
    kind: 'single',
    keywords: ['behavior', 'agents.md', 'system prompt', 'global rules', 'instructions', 'override'],
  },
  {
    slug: 'commands',
    title: 'Commands',
    group: 'mage',
    kind: 'split',
    keywords: ['command', 'commands', 'slash', 'macros', 'automation'],
  },
  {
    slug: 'mcp',
    title: 'MCP',
    group: 'mage',
    kind: 'split',
    keywords: ['mcp', 'model context protocol', 'servers', 'tools', 'remote', 'stdio'],
  },
  {
    slug: 'plugins',
    title: 'Plugins',
    group: 'mage',
    kind: 'split',
    keywords: ['plugin', 'plugins', 'extensions', 'addons', 'npm', 'mage-wakatime'],
  },
  {
    slug: 'skills.installed',
    title: 'Skills',
    group: 'skills',
    kind: 'split',
    keywords: ['skill', 'skills', 'instructions', 'install', 'catalog'],
  },
  {
    slug: 'skills.catalog',
    title: 'Skills Catalog',
    group: 'skills',
    kind: 'single',
    keywords: ['install', 'catalog', 'external', 'repository', 'skills catalog'],
    isAvailable: () => false,
  },
  {
    slug: 'git',
    title: 'Git',
    group: 'git',
    kind: 'single',
    keywords: ['git', 'gitlab', 'identity', 'identities', 'ssh', 'profiles', 'credentials', 'keys', 'commit', 'gitmoji', 'oauth', 'merge requests', 'issues'],
    isAvailable: (ctx) => !ctx.isVSCode,
  },
  {
    slug: 'gitlab',
    title: 'GitLab',
    group: 'git',
    kind: 'single',
    keywords: ['gitlab', 'merge requests', 'issues', 'oauth', 'account'],
    isAvailable: (ctx) => !ctx.isVSCode,
  },
  {
    slug: 'appearance',
    title: 'Appearance',
    group: 'appearance',
    kind: 'single',
    keywords: ['theme', 'font', 'spacing', 'padding', 'corner radius', 'radius', 'input bar', 'keyboard', 'viewport', 'mobile', 'terminal', 'pwa', 'install name', 'app shortcuts'],
  },
  {
    slug: 'chat',
    title: 'Chat',
    group: 'general',
    kind: 'single',
    keywords: ['tools', 'diff', 'reasoning', 'dotfiles', 'draft', 'queue', 'output', 'copy', 'image', 'split messages', 'message actions'],
  },
  {
    slug: 'shortcuts',
    title: 'Shortcuts',
    group: 'general',
    kind: 'single',
    keywords: ['keyboard', 'hotkeys', 'shortcuts', 'bindings'],
    isAvailable: (ctx) => !ctx.isVSCode,
  },
  {
    slug: 'sessions',
    title: 'Sessions',
    group: 'general',
    kind: 'single',
    keywords: ['defaults', 'default agent', 'default model', 'retention', 'memory', 'limits', 'zen'],
  },
  {
    slug: 'magic-prompts',
    title: 'Magic Prompts',
    group: 'general',
    kind: 'split',
    keywords: ['prompts', 'templates', 'git', 'gitlab', 'review', 'commit', 'merge request'],
    isAvailable: (ctx) => !ctx.isVSCode,
  },
  {
    slug: 'snippets',
    title: 'Snippets',
    group: 'general',
    kind: 'split',
    keywords: ['prompt', 'templates', 'multi-run', 'strategy', 'approach'],
    isAvailable: () => false,
  },

  { slug: 'notifications', title: 'Notifications', group: 'general', kind: 'single', keywords: ['alerts', 'native', 'summary', 'summarization'], },
  { slug: 'proxy', title: 'Proxy', group: 'advanced', kind: 'single', keywords: ['proxy', 'http', 'https', 'network', 'password'], isAvailable: (ctx) => ctx.isDesktop },
  { slug: 'tunnel', title: 'Remote Tunnel', group: 'advanced', kind: 'single', keywords: ['tunnel', 'cloudflare', 'qr', 'remote', 'mobile', 'share'], isAvailable: (ctx) => !ctx.isVSCode && !ctx.isDesktop },
  { slug: 'about', title: 'About', group: 'advanced', kind: 'single', keywords: ['about', 'version', 'updates', 'release', 'changelog'], isAvailable: (ctx) => ctx.isMobile },
] as const;

const LEGACY_SIDEBAR_SECTION_TO_SETTINGS_SLUG: Partial<Record<SidebarSection, SettingsPageSlug>> = {
  sessions: 'sessions',
  agents: 'agents',
  commands: 'commands',
  mcp: 'mcp',
  skills: 'skills.installed',
  'git-identities': 'git',
  settings: 'appearance',
};

export function getSettingsPageMeta(slug: string): SettingsPageMeta | null {
  const normalized = slug.trim().toLowerCase();
  return (SETTINGS_PAGE_METADATA as readonly SettingsPageMeta[]).find((page) => page.slug === normalized) ?? null;
}

export function resolveSettingsSlug(value: string | null | undefined): SettingsPageSlug {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'appearance';
  }

  const legacy = (LEGACY_SIDEBAR_SECTION_TO_SETTINGS_SLUG as Record<string, SettingsPageSlug>)[normalized];
  if (legacy) {
    return legacy;
  }

  if (normalized === 'gitlab') {
    return 'git';
  }

  const direct = getSettingsPageMeta(normalized);
  if (direct) {
    return direct.slug;
  }

  return 'appearance';
}
