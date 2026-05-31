// Smoke tests for the project sidebar component.
//
// No test runner is installed. Run with:
//     pnpm exec tsx src/components/ProjectSidebar.test.tsx
// Exits non-zero if any assertion fails.

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { ProjectSidebar } from './ProjectSidebar';
import { mockShellOptions, mockWorkspaceBootstrap } from '@/mockApiData';

let failures = 0;
const check = (label: string, cond: boolean, detail?: unknown) => {
  if (cond) {
    // eslint-disable-next-line no-console
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    // eslint-disable-next-line no-console
    console.error(`  FAIL ${label}`, detail ?? '');
  }
};

console.log('ProjectSidebar');

const html = renderToStaticMarkup(
  <ProjectSidebar
    shellOptions={mockShellOptions}
    sessions={mockWorkspaceBootstrap.sessions}
    activeSessionId={mockWorkspaceBootstrap.defaults.activeSessionId}
    activePage="workspace"
    weeklyCost={mockWorkspaceBootstrap.defaults.weeklyCost}
    onNavigate={() => undefined}
    onSessionSelect={() => undefined}
    onPrimaryAction={() => undefined}
    onProjectAction={() => undefined}
  />,
);
const translatedHtml = renderToStaticMarkup(
  <ProjectSidebar
    shellOptions={mockShellOptions}
    sessions={mockWorkspaceBootstrap.sessions}
    activeSessionId={mockWorkspaceBootstrap.defaults.activeSessionId}
    activePage="workspace"
    weeklyCost={mockWorkspaceBootstrap.defaults.weeklyCost}
    t={(key, replacements) => {
      const translated: Record<string, string> = {
        'sidebar.sessions': 'SESSIONS_TRANSLATED',
        'sidebar.more': 'MORE_TRANSLATED',
        'sidebar.projectManagement': 'PROJECT_MANAGEMENT_TRANSLATED',
        'sidebar.showMoreSessions': 'SHOW_{count}_MORE_TRANSLATED',
      };
      let value = translated[key] ?? key;
      if (replacements) {
        for (const [name, replacement] of Object.entries(replacements)) {
          value = value.replace(`{${name}}`, String(replacement));
        }
      }
      return value;
    }}
    onNavigate={() => undefined}
    onSessionSelect={() => undefined}
    onPrimaryAction={() => undefined}
    onProjectAction={() => undefined}
  />,
);
const moreAttrStart = html.indexOf('data-sidebar-more="true"');
const moreStart =
  moreAttrStart >= 0 ? html.lastIndexOf('<button', moreAttrStart) : -1;
const moreHtml =
  moreStart >= 0 ? html.slice(moreStart, html.indexOf('</button>', moreStart)) : '';
const hiddenSessionCount = Math.max(mockWorkspaceBootstrap.sessions.length - 6, 0);
const componentSource = readFileSync(
  new URL('./ProjectSidebar.tsx', import.meta.url),
  'utf8',
);

check('renders active project monogram', html.includes('MS'), html);
check('renders active project name', html.includes('my-saas'), html);
check('renders Inbox action', html.includes('Inbox'), html);
check('renders New session action', html.includes('New session'), html);
check('renders build stats default expanded', html.includes('aria-expanded="true"'), html);
check('renders weekly cost from workspace state', html.includes('$8.42'), html);
check('renders session section', html.includes('Sessions'), html);
check(
  'renders translated sidebar labels when translator is provided',
  translatedHtml.includes('SESSIONS_TRANSLATED') &&
    translatedHtml.includes('MORE_TRANSLATED') &&
    translatedHtml.includes('PROJECT_MANAGEMENT_TRANSLATED') &&
    translatedHtml.includes(`aria-label="SHOW_${hiddenSessionCount}_MORE_TRANSLATED"`),
  translatedHtml,
);
check('renders workspace sessions', html.includes('Fix login flicker'), html);
check('keeps collapsed session list height content-sized', html.includes('space-y-1 pr-1 overflow-visible') && !html.includes('h-52 overflow-y-auto'), html);
check('keeps expanded session list fixed-height scrollable', componentSource.includes("sessionsExpanded ? 'h-52 overflow-y-auto' : 'overflow-visible'"), componentSource);
check('uses compact sidebar item spacing', html.includes('min-h-6') && html.includes('py-[3px]'), html);
check('uses wider spacing between sidebar sections', html.includes('flex-1 space-y-5.5 overflow-y-auto'), html);
check('removes back and forward controls', !componentSource.includes('ArrowLeft') && !componentSource.includes('ArrowRight') && !html.includes('Go back') && !html.includes('Go forward'), componentSource);
check('removes project switcher divider lines', !componentSource.includes('border-b border-[var(--hairline)] px-3 py-1.5') && componentSource.includes('<div className="px-3 py-1.5">'), componentSource);
check('renders increased sidebar item font size', html.includes('text-[14px]'), html);
check('renders capitalized overflow session indicator', html.includes('More'), html);
check('does not render legacy lowercase dotted more text', !html.includes('...more'), html);
check('renders more indicator without icon wrapper', moreHtml.length > 0, html);
check('renders more indicator as a clickable button', moreHtml.includes('type="button"'), moreHtml);
check('more indicator starts collapsed', moreHtml.includes('aria-expanded="false"'), moreHtml);
check(
  'more indicator announces expandable session count',
  moreHtml.includes(`aria-label="Show ${hiddenSessionCount} more sessions"`),
  moreHtml,
);
check('more indicator uses a three-dot icon', moreHtml.includes('<svg'), moreHtml);
check(
  'renders more indicator with larger bold text',
  html.includes('text-[14px] font-semibold'),
  html,
);
check('renders hidden session count', html.includes(`+${hiddenSessionCount}`), html);
check('limits extra mock sessions behind more indicator', !html.includes('Profile API review'), html);
check(
  'more indicator can toggle back to collapsed state',
  componentSource.includes("setSessionsExpanded((expanded) => !expanded)") &&
    componentSource.includes("translate('sidebar.less', 'Less')") &&
    componentSource.includes("translate('sidebar.more', 'More')"),
  componentSource,
);
check('renders project management section', html.includes('Project management'), html);
check('renders system section', html.includes('System'), html);
check('renders Skill library with book icon', html.includes('Skill library') && html.includes('lucide-book-open'), html);
check('does not render duplicate project sessions from shell data', !html.includes('undefined'));

if (failures > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
} else {
  // eslint-disable-next-line no-console
  console.log('\nAll ProjectSidebar assertions passed.');
}
