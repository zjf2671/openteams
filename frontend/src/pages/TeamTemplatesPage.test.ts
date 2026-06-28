// Smoke tests for the team templates page wiring.
//
// No test runner is installed. Run with:
//     pnpm exec tsx src/pages/TeamTemplatesPage.test.ts
// Exits non-zero if any assertion fails.

import { readFileSync } from 'node:fs';
import {
  addCustomMemberDraft,
  commitMemberSystemPromptDraft,
  commitTeamProtocolDraft,
  createTeamPresetDraft,
  teamPresetDraftToPayload,
  validateMemberToolsEnabledDraft,
  validateTeamPresetDraft,
} from './TeamTemplatesPage';

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

const source = readFileSync(new URL('./TeamTemplatesPage.tsx', import.meta.url), 'utf8');

console.log('TeamTemplatesPage');

const draft = createTeamPresetDraft();
check(
  'new entry creates an aggregate draft',
  draft.leadMemberId === 'lead' &&
    draft.members.length === 1 &&
    Array.isArray(draft.workflowSteps),
  draft,
);

const added = addCustomMemberDraft({
  ...draft,
  name: 'Custom team',
  workflowSteps: [
    { title: 'Plan', description: '' },
    { title: '  ', description: '  ' },
  ],
});
check(
  'add member updates draft and selects the new member',
  added.form.members.length === 2 &&
    added.selectedMemberId === added.form.members[1]?.id,
  added,
);

const markdownDraft = commitMemberSystemPromptDraft(
  commitTeamProtocolDraft(added.form, '## Review rules'),
  added.selectedMemberId,
  '### Role\nReview the delivery plan.',
);
check(
  'markdown edits write into the aggregate draft',
  markdownDraft.teamProtocol.includes('Review rules') &&
    markdownDraft.members[1]?.systemPrompt.includes('delivery plan'),
  markdownDraft,
);

const invalidMcpDraft = {
  ...markdownDraft,
  members: markdownDraft.members.map((member) =>
    member.id === added.selectedMemberId
      ? { ...member, toolsEnabledText: '{ invalid json' }
      : member,
  ),
};
const invalidMcpResult = validateTeamPresetDraft(invalidMcpDraft);
check(
  'invalid MCP JSON is reported against the edited member',
  invalidMcpResult.issue?.memberId === added.selectedMemberId &&
    invalidMcpResult.issue.message ===
      'Invalid JSON format. Please check your syntax.',
  invalidMcpResult,
);

const blankNameInvalidMcp = {
  ...draft,
  members: [{ ...draft.members[0]!, toolsEnabledText: '{ invalid json' }],
};
const memberOnlyMcpResult = validateMemberToolsEnabledDraft(
  blankNameInvalidMcp,
  'lead',
);
check(
  'MCP blur validation targets tools JSON before whole-form required fields',
  memberOnlyMcpResult?.memberId === 'lead' &&
    memberOnlyMcpResult.message ===
      'Invalid JSON format. Please check your syntax.',
  memberOnlyMcpResult,
);

const fixedMcpDraft = {
  ...markdownDraft,
  members: markdownDraft.members.map((member) =>
    member.id === added.selectedMemberId
      ? {
          ...member,
          toolsEnabledText: '{"mcpServers":{"filesystem":true}}',
          selectedSkillIdsText: 'review, planning',
        }
      : member,
  ),
};
const payload = teamPresetDraftToPayload(fixedMcpDraft);
check(
  'payload mapping filters blank workflow steps and parses MCP JSON',
    payload.workflow_steps.length === 1 &&
    payload.workflow_steps[0]?.title === 'Plan' &&
    Boolean(payload.members[1]?.tools_enabled) &&
    typeof payload.members[1].tools_enabled === 'object' &&
    !Array.isArray(payload.members[1].tools_enabled),
  payload,
);

const invalidMemberName = validateTeamPresetDraft({
  ...draft,
  name: 'Needs member name',
  members: [{ ...draft.members[0]!, name: '' }],
});
check(
  'member name validation runs before submit',
  invalidMemberName.issue?.message === 'Member name is required.',
  invalidMemberName,
);

check('loads templates through the real API adapter', source.includes('teamPresetsApi.list()'));
check('loads template details on selection', source.includes('teamPresetsApi.get('));
check('groups backend templates under my team templates', source.includes('myTeamTemplates') && source.includes('我的团队模板'));
check('renders advanced team templates from mock data', source.includes('advancedTeamTemplates') && source.includes('更多推荐模板'));
check('keeps the detail page in the Linear-style pipeline layout', source.includes('team-template-workflow-preview') && source.includes('PIPELINE /') && source.includes('MEMBERS /'));
check('shows recoverable loading errors', source.includes('loadError') && source.includes('loadTemplates()'));
check('shows an empty my-template state', source.includes('myTeamTemplates.length === 0'));
check('keeps built-in templates read-only', source.includes('selectedDetail.is_builtin') && source.includes('canEditSelected'));
check('supports create, update, and delete flows', source.includes('teamPresetsApi.create') && source.includes('teamPresetsApi.update') && source.includes('teamPresetsApi.delete'));
check('confirms deletion before mutating', source.includes('window.confirm'));
check('preserves form input on save failure', source.includes('setFormError(errorMessage') && source.includes('return;'));
check('shows member skills and role prompt details', source.includes('selected_skill_ids') && source.includes('system_prompt'));
check('keeps Linear visual refinement hooks', source.includes('team-template-card') && source.includes('team-template-member-row') && source.includes('team-template-field'));
check('uses aggregate draft workflow steps', source.includes('workflowSteps') && source.includes('normalizeWorkflowSteps'));
check('supports editable markdown fields rendered with AgentMarkdown', source.includes('function MarkdownEditableField') && source.includes('<AgentMarkdown content={value}'));
check('edits member tool JSON through toolsEnabledText', source.includes('toolsEnabledText') && source.includes('parseToolsEnabled'));
check('validates required team and member fields before saving', source.includes('validateTeamPresetForm') && source.includes('Team name is required.') && source.includes('Member name is required.'));
check('blocks invalid MCP JSON before payload submission', source.includes('Invalid JSON format. Please check your syntax.'));
check('MCP blur validation sets visible member tool errors', source.includes('validateMemberToolsOnBlur') && source.includes('setFormError(issue.message)') && source.includes('setEditorSelectedMemberId(issue.memberId)'));
check('MCP blur uses member-scoped validation instead of whole-form validation', source.includes('{ validateTools: true }') && source.includes('onValidateMemberTools?.(nextForm, selectedFormMember.id)'));
check('workflow step edit keys stay stable while title changes', source.includes('key={`workflow-step-${index}`}') && !source.includes('key={`${index}-${step.title}`}'));
check('delete actions expose deleting state', source.includes('Deleting...') && source.includes('deleting={deleting}') && source.includes('setEditorMode(null);'));
check('reuses TemplateDetailView for create and edit mode', !source.includes('<TemplateEditor') && source.includes('editorMode={editorMode}'));
check('adds and auto-selects custom member drafts', source.includes('addCustomMember') && source.includes('setSelectedMemberId(nextMember.id)'));
check('keeps readonly detail rendering isolated from editable controls', source.includes('const isEditing = Boolean(editorMode && form)') && source.includes('canEdit && !isEditing'));

if (failures > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
} else {
  // eslint-disable-next-line no-console
  console.log('\nAll TeamTemplatesPage assertions passed.');
}
