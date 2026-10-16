'use strict';
// Definitions for the HN Group and Horizon Network service websites. `generate.cjs` turns these into
// independent site directories (<id>-site/). Content states only documented facts about the group.

const COMPANIES = ['HN Group', 'Horizon Network', 'Horizon Media Group', 'Horizon Holding Co', 'Horizon Advertising', 'Horizon Development'];
const PORTAL_COMPANIES = ['HN Group', 'Horizon Network', 'Horizon Advertising', 'Horizon Development', 'Horizon Media Group'];
const LABELS = {
  new: 'New', open: 'Open', reviewing: 'Reviewing', 'in-progress': 'In progress', resolved: 'Resolved', closed: 'Closed', declined: 'Declined', cancelled: 'Cancelled',
  planning: 'Planning', active: 'Active', 'on-hold': 'On hold', completed: 'Completed', upcoming: 'Upcoming', achieved: 'Achieved', missed: 'Missed',
  todo: 'To do', blocked: 'Blocked', done: 'Done', planned: 'Planned', fixed: 'Fixed', registered: 'Registered', attended: 'Attended', 'in-discussion': 'In discussion',
  accepted: 'Accepted', quoted: 'Quote sent', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', ordered: 'Ordered', received: 'Received',
  'in-use': 'In use', available: 'Available', repair: 'In repair', retired: 'Retired', lost: 'Lost', 'under-review': 'Under review', inactive: 'Inactive',
  'renewal-due': 'Renewal due', expired: 'Expired', requested: 'Requested', confirmed: 'Confirmed', triaging: 'Triaging', 'not-applicable': 'Not applicable',
  shortlisted: 'Shortlisted', winner: 'Winner', 'not-selected': 'Not selected', withdrawn: 'Withdrawn', contacted: 'Contacted', 'awaiting-provider': 'Awaiting provider configuration',
  suspended: 'Suspended', pending: 'Pending', 'awaiting-registrar': 'Awaiting registrar configuration'
};
const S = (...ids) => ids.map(id => ({ id, label: LABELS[id] || id }));
const opt = list => list.map(v => (typeof v === 'string' ? { value: v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), label: v } : v));
const f = (name, label, type = 'text', extra = {}) => ({ name, label, type, ...extra });
const title = (label = 'Title') => f('title', label, 'text', { required: true, max: 160 });
const summary = () => f('summary', 'Summary', 'text', { max: 300 });
const bodyField = (label = 'Details') => f('body', label, 'textarea', { max: 20000 });
const nameF = () => f('name', 'Your name', 'text', { required: true, max: 120, autocomplete: 'name' });
const emailF = (required = true) => f('email', 'Email', 'email', { required, contact: true, autocomplete: 'email' });
const company = (label = 'Company', list = COMPANIES) => f('company', label, 'select', { options: list, filter: true });
const PRIVACY = 'I understand HN Group will use these details to respond, as described in the HN Group privacy notice.';
const NET_PRIVACY = 'I understand Horizon Network will use these details to respond, as described in the Horizon Network privacy notice.';

const catalog = (key, t, extra = {}) => ({ key, type: 'items', title: t, view: 'public', create: 'manager', manage: 'admin', publish: true, comments: false, ...extra });
const intake = (key, t, extra = {}) => ({ key, type: 'items', title: t, view: 'manager', create: 'public', manage: 'admin', reference: true, comments: true, consent: PRIVACY, scope: 'own', ...extra });
const records = (key, t, extra = {}) => ({ key, type: 'items', title: t, view: 'staff', create: 'staff', manage: 'staff', comments: true, display: 'table', ...extra });

// ---------- staff-portal synchronised modules ----------
const expensesBridge = {
  key: 'claims', type: 'bridge', title: 'Expense claims', nav: 'Claims', intro: 'Submit, approve and pay expense claims. Claims are shared with the staff portal.', portalUrl: 'https://staff.hngroup.org.uk/expenses',
  load: { path: '/api/expenses' },
  views: [
    { id: 'mine', label: 'My claims', items: 'mine', columns: [{ field: 'date', label: 'Date', format: 'date' }, { field: 'category', label: 'Category' }, { field: 'description', label: 'Description' }, { field: 'amount', label: 'Amount', format: 'pounds' }, { field: 'status', label: 'Status', format: 'status', labelField: 'statusLabel' }],
      download: { path: '/api/expenses/{id}/receipt', when: 'receipt', label: 'Receipt' }, actions: [{ id: 'cancel', label: 'Withdraw', path: '/api/expenses/{id}/cancel', when: 'canCancel', confirm: 'Withdraw this claim? It will be deleted.', danger: true }], empty: 'You have no expense claims.' },
    { id: 'approve', label: 'Waiting for your approval', items: 'toApprove', when: 'toApprove', columns: [{ field: 'person.displayName', label: 'Person' }, { field: 'date', label: 'Date', format: 'date' }, { field: 'description', label: 'Description' }, { field: 'amount', label: 'Amount', format: 'pounds' }],
      download: { path: '/api/expenses/{id}/receipt', when: 'receipt', label: 'Receipt' },
      actions: [{ id: 'approve', label: 'Approve', path: '/api/expenses/{id}/approve', when: 'canApprove', fields: [f('note', 'Note (optional)', 'text', { max: 300 })] }, { id: 'reject', label: 'Reject', path: '/api/expenses/{id}/reject', when: 'canApprove', danger: true, fields: [f('note', 'Reason', 'text', { max: 300, required: true })] }] },
    { id: 'all', label: 'All claims (payroll & finance)', items: 'all', when: 'canPay', columns: [{ field: 'person.displayName', label: 'Person' }, { field: 'date', label: 'Date', format: 'date' }, { field: 'description', label: 'Description' }, { field: 'amount', label: 'Amount', format: 'pounds' }, { field: 'status', label: 'Status', format: 'status', labelField: 'statusLabel' }],
      download: { path: '/api/expenses/{id}/receipt', when: 'receipt', label: 'Receipt' },
      actions: [{ id: 'pay', label: 'Pay', path: '/api/expenses/{id}/pay', when: 'canPay', equals: undefined, fields: [f('method', 'How', 'select', { required: true, options: [{ value: 'direct', label: 'Paid now from company funds' }, { value: 'payslip', label: 'Add to next payslip' }] })] }] }
  ],
  forms: [
    { id: 'claim', label: 'Submit a claim', path: '/api/expenses', upload: { header: 'x-claim', required: false, label: 'Receipt (PDF or image, up to 10 MB)', accept: '.pdf,.jpg,.jpeg,.png,.webp,.gif,.heic' },
      fields: [f('date', 'Date of expense', 'date', { required: true }), f('amount', 'Amount (£)', 'text', { required: true, help: 'For example 12.50' }), f('category', 'Category', 'text', { help: 'A staff portal finance category, for example Travel. Unknown categories are filed as Other.' }), f('description', 'Description', 'text', { required: true, max: 300, wide: true })] },
    { id: 'mileage', label: 'Claim mileage', path: '/api/expenses', upload: { header: 'x-claim', required: false, label: 'Supporting document (optional)' },
      fields: [f('kind', 'Kind', 'text', { fixed: 'mileage' }), f('date', 'Date of journey', 'date', { required: true }), f('miles', 'Miles', 'number', { required: true, min: 0, max: 2000, integer: false }), f('from', 'From', 'text', { required: true, max: 120 }), f('to', 'To', 'text', { required: true, max: 120 }), f('returnTrip', 'Return journey', 'checkbox'), f('description', 'Purpose (optional)', 'text', { max: 300, wide: true })], intro: 'Mileage is paid at HMRC rates, calculated by the staff portal.' }
  ]
};
const invoicesBridge = {
  key: 'invoices', type: 'bridge', title: 'Invoices', intro: 'Create, send and track customer invoices. Invoices are shared with the staff portal (payroll & finance permission required).', portalUrl: 'https://staff.hngroup.org.uk/invoices',
  load: { path: '/api/invoices' },
  views: [{ id: 'invoices', label: 'Invoices', items: 'invoices', columns: [{ field: 'number', label: 'Number' }, { field: 'company', label: 'Company' }, { field: 'customer.name', label: 'Customer' }, { field: 'issueDate', label: 'Issued', format: 'date' }, { field: 'dueDate', label: 'Due', format: 'date' }, { field: 'total', label: 'Total', format: 'pounds' }, { field: 'status', label: 'Status', format: 'status', labelField: 'statusLabel' }],
    actions: [{ id: 'sent', label: 'Mark sent', path: '/api/invoices/{id}/sent', when: 'status', equals: 'draft' }, { id: 'paid', label: 'Mark paid', path: '/api/invoices/{id}/paid', when: 'status', in: ['draft', 'sent'], fields: [f('source', 'Received by', 'select', { required: true, options: [{ value: 'bank', label: 'Bank transfer' }, { value: 'paypal', label: 'PayPal' }] })] },
      { id: 'void', label: 'Void', path: '/api/invoices/{id}/void', when: 'status', in: ['draft', 'sent'], confirm: 'Void this invoice?', danger: true }, { id: 'delete', label: 'Delete', path: '/api/invoices/{id}/delete', when: 'status', equals: 'draft', confirm: 'Delete this draft?', danger: true }], empty: 'No invoices yet, or your account does not have payroll & finance permission.' }],
  forms: [{ id: 'invoice', label: 'Create invoice', path: '/api/invoices', passthrough: true, success: 'Draft invoice saved to the staff portal.',
    fields: [f('company', 'Invoice from', 'select', { required: true, options: PORTAL_COMPANIES.map(c => ({ value: c, label: c })) }), f('customerName', 'Customer name', 'text', { required: true, max: 120 }), f('customerEmail', 'Customer email', 'email'), f('customerAddress', 'Customer address', 'textarea', { max: 400 }),
      f('issueDate', 'Issue date', 'date'), f('dueDate', 'Due date', 'date'), f('reference', 'Reference', 'text', { max: 80 }), f('vatRate', 'VAT rate', 'select', { options: [{ value: '0', label: 'No VAT' }, { value: '5', label: '5%' }, { value: '20', label: '20%' }] }), f('notes', 'Notes', 'textarea', { max: 1000 }), f('lines', 'Lines', 'lines')] }]
};
const trainingBridge = {
  key: 'training', type: 'bridge', title: 'Training records', nav: 'Records', intro: 'Your training and certificates, shared with the staff portal. HR can verify records and set required courses.', portalUrl: 'https://staff.hngroup.org.uk/training',
  load: { path: '/api/training' },
  views: [
    { id: 'mine', label: 'My training', items: 'mine', columns: [{ field: 'course', label: 'Course' }, { field: 'provider', label: 'Provider' }, { field: 'completedOn', label: 'Completed', format: 'date' }, { field: 'expiresOn', label: 'Expires', format: 'date' }, { field: 'state', label: 'State', format: 'status' }, { field: 'verified', label: 'Verified', format: 'bool' }],
      download: { path: '/api/training/{id}/certificate', when: 'certificate', label: 'Certificate' }, actions: [{ id: 'delete', label: 'Delete', path: '/api/training/{id}/delete', when: 'canEdit', confirm: 'Delete this training record?', danger: true }], empty: 'No training records yet.' },
    { id: 'required', label: 'Required courses', items: 'required', columns: [{ field: 'course', label: 'Course' }, { field: 'company', label: 'For' }], actions: [{ id: 'remove', label: 'Remove', path: '/api/training/required/{id}/delete', when: 'id', confirm: 'Remove this required course?', danger: true }], empty: 'No courses are currently required.' },
    { id: 'all', label: 'Everyone (HR)', items: 'all', when: 'canManage', columns: [{ field: 'person.displayName', label: 'Person' }, { field: 'course', label: 'Course' }, { field: 'completedOn', label: 'Completed', format: 'date' }, { field: 'expiresOn', label: 'Expires', format: 'date' }, { field: 'state', label: 'State', format: 'status' }, { field: 'verified', label: 'Verified', format: 'bool' }],
      download: { path: '/api/training/{id}/certificate', when: 'certificate', label: 'Certificate' }, actions: [{ id: 'verify', label: 'Verify', path: '/api/training/{id}/verify', when: 'verified', equals: false }] }
  ],
  forms: [
    { id: 'record', label: 'Add a training record', path: '/api/training', upload: { header: 'x-training', required: false, label: 'Certificate (PDF or image, optional)', accept: '.pdf,.jpg,.jpeg,.png' },
      fields: [f('course', 'Course', 'text', { required: true, max: 120 }), f('provider', 'Provider', 'text', { max: 120 }), f('completedOn', 'Completed on', 'date', { required: true }), f('expiresOn', 'Expires on', 'date'), f('note', 'Note', 'text', { max: 500, wide: true })] },
    { id: 'required', label: 'Require a course (HR)', path: '/api/training/required', when: 'canManage', fields: [f('course', 'Course', 'text', { required: true, max: 120 }), f('company', 'Required for', 'select', { options: [{ value: '', label: 'Everyone' }, ...PORTAL_COMPANIES.map(c => ({ value: c, label: c }))] })] }
  ]
};
const reportsBridge = { key: 'monthly', type: 'bridge', title: 'Monthly staff report', nav: 'Monthly report', intro: 'Live monthly report from the staff portal (requires the reports permission there).', render: 'report', portalUrl: 'https://staff.hngroup.org.uk/reports', load: { path: '/api/reports', query: [{ name: 'month', label: 'Month', type: 'month', default: 'thisMonth' }] }, views: [] };
const staffFilesBridge = { key: 'hrfiles', type: 'bridge', title: 'HR documents', nav: 'HR documents', intro: 'Documents HR has shared with you in the staff portal, such as contracts. Only HR can add or change these.', portalUrl: 'https://staff.hngroup.org.uk/staff-files', load: { path: '/api/staff-files' },
  views: [{ id: 'files', label: 'Shared with you', items: 'files', columns: [{ field: 'title', label: 'Title' }, { field: 'category', label: 'Category' }, { field: 'uploadedAt', label: 'Added', format: 'date' }], download: { path: '/api/staff-files/{id}/file', label: 'Download' }, empty: 'HR has not shared any documents with you.' }] };
const pollsBridge = { key: 'staffpolls', type: 'bridge', title: 'Staff polls & surveys', nav: 'Staff polls', intro: 'Polls and surveys for staff from the staff portal. Answer here or in the portal; results are the same.', render: 'polls', portalUrl: 'https://staff.hngroup.org.uk/polls', load: { path: '/api/polls' },
  views: [{ id: 'polls', label: 'Polls', items: 'polls', columns: [], actions: [{ id: 'respond', label: 'Respond', path: '/api/polls/{id}/respond', passthrough: true }, { id: 'close', label: 'Close', path: '/api/polls/{id}/close' }, { id: 'reopen', label: 'Reopen', path: '/api/polls/{id}/reopen' }, { id: 'delete', label: 'Delete', path: '/api/polls/{id}/delete' }] }],
  forms: [{ id: 'poll', label: 'Create a staff poll', path: '/api/polls', when: 'canManage', passthrough: true, fields: [f('title', 'Title', 'text', { required: true, max: 150 }), f('description', 'Description', 'textarea', { max: 2000 }), f('anonymous', 'Anonymous', 'checkbox'), f('showResults', 'Show results to respondents', 'checkbox'), f('closesAt', 'Closes', 'date'), f('questions', 'Questions', 'questions')] }] };
const ideasBridge = { key: 'ideas', type: 'bridge', title: 'Staff ideas box', nav: 'Staff ideas', intro: 'Ideas from HN Group staff, shared with the staff portal ideas box. Vote and comment here or in the portal.', render: 'ideas', portalUrl: 'https://staff.hngroup.org.uk/ideas', load: { path: '/api/ideas' },
  views: [{ id: 'ideas', label: 'Ideas', items: 'ideas', columns: [], actions: [{ id: 'vote', label: 'Vote', path: '/api/ideas/{id}/vote' }, { id: 'comment', label: 'Comment', path: '/api/ideas/{id}/comment', fields: [f('text', 'Comment', 'textarea', { required: true, max: 1500 })] },
    { id: 'status', label: 'Set status', path: '/api/ideas/{id}/status', fields: [f('status', 'Status', 'select', { required: true, options: [{ value: 'new', label: 'New' }, { value: 'review', label: 'Under review' }, { value: 'planned', label: 'Planned' }, { value: 'progress', label: 'In progress' }, { value: 'done', label: 'Done' }, { value: 'declined', label: 'Declined' }] }), f('note', 'Note', 'textarea', { max: 1000 })] }] }],
  forms: [{ id: 'idea', label: 'Share an idea', path: '/api/ideas', fields: [f('title', 'Idea', 'text', { required: true, max: 150 }), f('body', 'Details', 'textarea', { max: 3000 }), f('category', 'Category', 'select', { options: [{ value: 'workplace', label: 'Workplace' }, { value: 'process', label: 'Process' }, { value: 'tech', label: 'Technology' }, { value: 'wellbeing', label: 'Wellbeing' }, { value: 'customers', label: 'Customers' }, { value: 'other', label: 'Other' }] }), f('anonymous', 'Post anonymously', 'checkbox')] }] };
const calendarBridge = { key: 'calendar', type: 'bridge', title: 'Staff calendar', nav: 'Staff calendar', intro: 'Company events from the staff portal calendar, with bank holidays and leave. Editing needs the events permission in the staff portal.', render: 'calendar', portalUrl: 'https://staff.hngroup.org.uk/calendar',
  load: { path: '/api/calendar', query: [{ name: 'from', label: 'From', type: 'date' }, { name: 'to', label: 'To', type: 'date' }] },
  views: [{ id: 'calendar', label: 'Calendar', items: 'items', columns: [], actions: [{ id: 'delete', label: 'Delete', path: '/api/events/{id}/delete' }] }],
  forms: [{ id: 'event', label: 'Add a staff event', path: '/api/events', when: 'canManage', fields: [f('title', 'Title', 'text', { required: true, max: 150 }), f('type', 'Type', 'select', { options: ['event', 'meeting', 'social', 'training', 'holiday'].map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) }), f('startDate', 'Start date', 'date', { required: true }), f('endDate', 'End date', 'date'), f('allDay', 'All day', 'checkbox'), f('startTime', 'Start time', 'time'), f('endTime', 'End time', 'time'), f('location', 'Location', 'text', { max: 150 }), f('description', 'Description', 'textarea', { max: 2000 })] }] };
const billsBridge = (forms = []) => ({ key: 'bills', type: 'bridge', title: 'Supplier bills', nav: 'Bills', intro: 'Supplier bills recorded in the staff portal (payroll & finance permission required).', portalUrl: 'https://staff.hngroup.org.uk/bills', load: { path: '/api/bills' },
  views: [{ id: 'bills', label: 'Bills', items: 'bills', columns: [{ field: 'supplier', label: 'Supplier' }, { field: 'reference', label: 'Reference' }, { field: 'amount', label: 'Amount', format: 'pounds' }, { field: 'dueDate', label: 'Due', format: 'date' }, { field: 'repeatLabel', label: 'Repeats' }, { field: 'status', label: 'Status', format: 'status' }], empty: 'No bills, or your account does not have payroll & finance permission.' }], forms });

// ---------- shared content ----------
const GROUP_SECTION = { eyebrow: 'HN GROUP', title: 'Part of HN Group', text: 'HN Group Limited directly owns Horizon Network, Horizon Media Group and Horizon Holding Co. Horizon Development is part of Horizon Network. Horizon Advertising is a subsidiary of Horizon Media Group and is managed by Horizon Network.' };
const NO_EMAIL = { title: 'No automatic emails.', text: 'This website does not send email notifications. Keep your private reference to check progress and read replies here.', email: false };
const forumCategories = [{ id: 'general', label: 'General' }, { id: 'help', label: 'Help & questions' }, { id: 'ideas', label: 'Ideas & feedback' }, { id: 'introductions', label: 'Introductions' }, { id: 'off-topic', label: 'Off topic' }];
const GUIDELINES = 'Be respectful and constructive. No harassment, hate, spam or advertising. Do not post personal information about yourself or others, passwords or account details. Moderators may hide posts or lock discussions that break these guidelines. Report anything that concerns you using the Report link.';

const group = 'group', network = 'network';
const sites = [
  // ===================== HN Group =====================
  { id: 'billing', company: group, name: 'HN Group Billing', title: 'Invoices and payments', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP BILLING', title: 'Invoices and payments.', lead: 'Create and track customer invoices and record payments. Records are shared with the staff portal, so finance always works from one set of figures.', actions: [{ label: 'Open invoices', href: '#/bridge/invoices' }] },
    providers: { payments: { label: 'Online card payments', status: 'awaiting-configuration', note: 'No payment provider is connected, so customers cannot pay online yet. Record payments here when funds arrive by bank transfer or PayPal.' } },
    modules: [invoicesBridge], links: { category: 'staff', description: 'Customer invoices and payments, synchronised with the staff portal.' } },

  { id: 'projects', company: group, name: 'HN Group Projects', title: 'Projects, tasks and milestones', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP PROJECTS', title: 'Projects, tasks and milestones.', lead: 'Plan work across the group: create projects, assign tasks to colleagues and track milestones.', actions: [{ label: 'View projects', href: '#/m/projects' }] },
    modules: [
      records('projects', 'Projects', { singular: 'project', cta: 'New project', intro: 'All group projects. Open a project to add tasks and milestones.', display: 'cards', files: 'creator',
        fields: [title('Project name'), summary(), company('Company'), f('owner', 'Project lead', 'user'), f('start', 'Start date', 'date'), f('due', 'Target date', 'date'), bodyField('Description')], listFields: ['company', 'owner', 'due'],
        statuses: S('planning', 'active', 'on-hold', 'completed', 'cancelled'), empty: 'No projects yet. Create the first one.' }),
      records('tasks', 'Tasks', { singular: 'task', parent: { module: 'projects', label: 'Project', cta: 'Add task' }, intro: 'Every task across all projects.',
        fields: [title('Task'), f('assignee', 'Assigned to', 'user'), f('due', 'Due', 'date'), f('priority', 'Priority', 'select', { options: opt(['Low', 'Normal', 'High', 'Urgent']), filter: true }), f('notes', 'Notes', 'textarea', { max: 5000 })], listFields: ['assignee', 'due', 'priority'],
        statuses: S('todo', 'in-progress', 'blocked', 'done', 'cancelled'), empty: 'No tasks yet. Open a project and add one.' }),
      records('milestones', 'Milestones', { singular: 'milestone', parent: { module: 'projects', label: 'Project', cta: 'Add milestone' },
        fields: [title('Milestone'), f('due', 'Due', 'date', { required: true }), f('owner', 'Owner', 'user'), f('notes', 'Notes', 'textarea', { max: 5000 })], listFields: ['due', 'owner'], statuses: S('upcoming', 'achieved', 'missed', 'cancelled'), empty: 'No milestones yet.' })
    ], links: { category: 'staff', description: 'Projects, tasks and milestones for group staff.' } },

  { id: 'brand', company: group, name: 'HN Group Brand', title: 'Brand assets and guidelines',
    hero: { eyebrow: 'HN GROUP BRAND', title: 'Our brand, ready to use.', lead: 'The approved logos for every HN Group company, the group colour palette, typography and guidance for using them correctly.', actions: [{ label: 'Logos & assets', href: '#/brand' }, { label: 'Guidelines', href: '#/m/guidelines' }] },
    brandkit: true,
    modules: [
      catalog('guidelines', 'Guidelines', { singular: 'guideline', intro: 'Brand guidance documents published by the group.', files: 'manager', fields: [title(), summary(), f('category', 'Category', 'select', { options: opt(['Logos', 'Colour', 'Typography', 'Writing', 'Templates', 'Other']), filter: true }), bodyField('Guidance')], listFields: ['category'], empty: 'No additional guideline documents have been published yet. The logo, colour and typography guidance is on the Logos & assets page.' }),
      catalog('assets', 'Downloads', { singular: 'asset', intro: 'Templates and other approved brand files.', files: 'manager', fields: [title(), summary(), company('Company'), f('format', 'Format', 'text', { max: 60 })], listFields: ['company', 'format'], empty: 'No extra brand files have been published yet. Approved logos are on the Logos & assets page.' })
    ], links: { category: 'resources', description: 'Approved logos, colours, typography and brand guidance.' } },

  { id: 'downloads', company: group, name: 'HN Group Downloads', title: 'Downloads and releases',
    hero: { eyebrow: 'HN GROUP DOWNLOADS', title: 'Downloads and releases.', lead: 'Versioned files and release notes published by HN Group. Each file shows its SHA-256 checksum so you can confirm your download is intact.', actions: [{ label: 'Browse releases', href: '#/m/releases' }] },
    modules: [catalog('releases', 'Releases', { singular: 'release', files: 'manager', showHash: true, maxFile: 10485760, intro: 'Newest first. Verify files with the SHA-256 checksum shown on each release.',
      fields: [title('Product'), f('version', 'Version', 'text', { required: true, max: 40 }), f('channel', 'Channel', 'select', { options: opt(['Stable', 'Beta', 'Preview']), filter: true }), f('released', 'Release date', 'date'), f('platform', 'Platform', 'text', { max: 80 }), summary(), bodyField('Release notes')], listFields: ['version', 'channel', 'released', 'platform'],
      empty: 'No downloads have been published yet.' })], links: { category: 'resources', description: 'Versioned downloads and release notes with checksums.' } },

  { id: 'feedback', company: group, name: 'HN Group Feedback', title: 'Feedback, bug reports and suggestions', staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP FEEDBACK', title: 'Tell us what you think.', lead: 'Share feedback, report a bug or suggest an improvement to any HN Group website or service. You will get a private reference to follow up.', actions: [{ label: 'Send feedback', href: '#/m/feedback/new' }, { label: 'Check a reference', href: '#/ref' }] },
    notices: [NO_EMAIL],
    modules: [intake('feedback', 'Feedback', { singular: 'submission', cta: 'Send feedback', manage: 'staff', intro: 'Feedback, bug reports and suggestions sent to HN Group.', successTitle: 'Thank you for your feedback',
      fields: [f('type', 'Type', 'select', { required: true, filter: true, options: opt(['Feedback', 'Bug report', 'Suggestion']) }), title('Subject'), f('area', 'Website or service', 'text', { max: 120, help: 'For example staff.hngroup.org.uk or Horizon Network' }), bodyField('Details'), f('steps', 'Steps to reproduce (bugs)', 'textarea', { max: 5000 }), f('name', 'Your name (optional)', 'text', { max: 120 }), emailF(false)],
      listFields: ['type', 'area'], statuses: S('new', 'reviewing', 'planned', 'fixed', 'declined', 'closed'), cancellable: [] }), ideasBridge],
    links: { category: 'support', description: 'Send feedback, bug reports and suggestions with a private reference.' } },

  { id: 'events', company: group, name: 'HN Group Events', title: 'Events and registration', staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP EVENTS', title: 'Events and registration.', lead: 'Upcoming HN Group events, with online registration. Staff can also see the internal staff calendar.', actions: [{ label: 'Upcoming events', href: '#/m/events' }] },
    modules: [
      catalog('events', 'Events', { singular: 'event', capacity: { module: 'registrations' }, intro: 'Register for upcoming events. Places are limited where shown.',
        fields: [title('Event'), summary(), f('starts', 'Starts', 'datetime', { required: true }), f('ends', 'Ends', 'datetime'), f('location', 'Location', 'text', { max: 160 }), f('online', 'Online link', 'url', { internal: true, help: 'Only shown to staff; share joining details with registrants directly.' }), f('capacity', 'Places (0 = unlimited)', 'number', { min: 0, max: 100000 }), f('closes', 'Registration closes', 'datetime'), bodyField('About this event')],
        listFields: ['starts', 'location'], empty: 'There are no upcoming events at the moment.' }),
      intake('registrations', 'Registrations', { singular: 'registration', parent: { module: 'events', label: 'Event', cta: 'Register', capacity: 'capacity', closes: 'closes', unique: 'email' },
        fields: [nameF(), emailF(), f('organisation', 'Organisation', 'text', { max: 120 }), f('requirements', 'Accessibility or dietary requirements', 'textarea', { max: 2000 })], statuses: S('registered', 'attended', 'cancelled'), cancellable: ['registered'], successTitle: 'You are registered',
        successText: 'Your place has been recorded. Keep your private reference to check or cancel your registration.' }),
      calendarBridge
    ], links: { category: 'company', description: 'HN Group events with online registration.' } },

  { id: 'partners', company: group, name: 'HN Group Partners', title: 'Partnerships and applications',
    hero: { eyebrow: 'HN GROUP PARTNERS', title: 'Partner with HN Group.', lead: 'Apply to work with HN Group and its companies: Horizon Network, Horizon Media Group, Horizon Advertising and Horizon Development.', actions: [{ label: 'Apply to partner', href: '#/m/applications/new' }] },
    notices: [NO_EMAIL],
    sections: [GROUP_SECTION],
    modules: [
      catalog('partners', 'Our partners', { singular: 'partner', fields: [title('Partner'), summary(), f('website', 'Website', 'url'), f('type', 'Partnership', 'select', { options: opt(['Technology', 'Referral', 'Media', 'Advertising', 'Community', 'Other']), filter: true })], listFields: ['type', 'website'], empty: 'No partners are listed yet.' }),
      intake('applications', 'Partnership applications', { singular: 'application', cta: 'Apply to partner', successTitle: 'Application received',
        fields: [f('organisation', 'Organisation', 'text', { required: true, max: 160 }), nameF(), emailF(), f('website', 'Website', 'url'), f('type', 'Type of partnership', 'select', { required: true, filter: true, options: opt(['Technology', 'Referral', 'Media', 'Advertising', 'Community', 'Other']) }), f('interest', 'Which company', 'select', { options: COMPANIES.filter(c => c !== 'Horizon Holding Co'), filter: true }), bodyField('Your proposal')],
        listFields: ['organisation', 'type', 'interest'], statuses: S('new', 'reviewing', 'in-discussion', 'accepted', 'declined', 'closed') })
    ], links: { category: 'company', description: 'Partnership information and applications.' } },

  { id: 'services', company: group, name: 'HN Group Services', title: 'Services catalogue and quote requests',
    hero: { eyebrow: 'HN GROUP SERVICES', title: 'Services across the group.', lead: 'Digital infrastructure, advertising, software development and media from the HN Group companies. Choose a service to request a quote.', actions: [{ label: 'Browse services', href: '#/m/catalogue' }] },
    notices: [NO_EMAIL],
    modules: [
      catalog('catalogue', 'Services', { singular: 'service', fields: [title('Service'), f('provider', 'Provided by', 'select', { options: COMPANIES, filter: true }), f('availability', 'Availability', 'select', { options: [{ value: 'available', label: 'Available' }, { value: 'coming-soon', label: 'Coming soon' }], filter: true }), summary(), bodyField('About this service')], listFields: ['provider', 'availability'],
        seed: [
          { id: 'svc-infra', fields: { title: 'Digital infrastructure', provider: 'Horizon Network', availability: 'available', summary: 'Digital services and infrastructure from Horizon Network, monitored around the clock.', body: 'Horizon Network builds and runs the digital infrastructure behind HN Group services.' } },
          { id: 'svc-hosting', fields: { title: 'Horizon Hosting', provider: 'Horizon Network', availability: 'coming-soon', summary: 'VPS, dedicated servers and managed cloud — coming soon.', body: 'Horizon Hosting is Horizon Network’s planned hosting service. Request a quote to register your interest.' } },
          { id: 'svc-ads', fields: { title: 'Digital advertising', provider: 'Horizon Advertising', availability: 'available', summary: 'Display advertising, campaign management, analytics and reporting.', body: 'Horizon Advertising is a subsidiary of Horizon Media Group and is managed by Horizon Network.' } },
          { id: 'svc-dev', fields: { title: 'Software development', provider: 'Horizon Development', availability: 'available', summary: 'Custom software and web applications, from concept to deployment.', body: 'Horizon Development is part of Horizon Network.' } },
          { id: 'svc-media', fields: { title: 'Media and content', provider: 'Horizon Media Group', availability: 'available', summary: 'Media and content from the group’s media business.', body: 'Horizon Media Group also handles press enquiries for the group.' } }
        ] }),
      intake('quotes', 'Quote requests', { singular: 'quote request', parent: { module: 'catalogue', label: 'Service', cta: 'Request a quote' }, successTitle: 'Quote request received',
        fields: [nameF(), emailF(), f('organisation', 'Organisation', 'text', { max: 160 }), f('phone', 'Phone (optional)', 'text', { max: 40, contact: true }), f('timeline', 'When do you need this?', 'select', { options: opt(['As soon as possible', 'Within 1 month', 'Within 3 months', 'Just exploring']) }), f('budget', 'Budget (optional)', 'text', { max: 80 }), bodyField('What do you need?')],
        listFields: ['organisation', 'timeline'], statuses: S('new', 'reviewing', 'quoted', 'accepted', 'declined', 'closed') })
    ], links: { category: 'company', description: 'Services from every group company, with quote requests.' } },

  { id: 'trust', company: group, name: 'HN Group Trust Centre', title: 'Policies and trust information',
    hero: { eyebrow: 'HN GROUP TRUST CENTRE', title: 'Trust and policies.', lead: 'Approved HN Group policies and information about how we look after data and services, in one place.', actions: [{ label: 'Policies', href: '#/m/policies' }, { label: 'Ask a question', href: '#/m/questions/new' }] },
    notices: [NO_EMAIL],
    related: [{ label: 'HN Group privacy notice', url: 'https://hngroup.org.uk/privacy', text: 'How HN Group handles personal information on hngroup.org.uk' }, { label: 'Horizon Network privacy notice', url: 'https://horizon-network.co.uk/privacy', text: 'How personal information is handled on horizon-network.co.uk' }, { label: 'Security', url: 'https://security.hngroup.org.uk', text: 'Report a security vulnerability' }, { label: 'Service status', url: 'https://status.hngroup.org.uk', text: 'Live service status' }],
    modules: [
      catalog('policies', 'Policies', { singular: 'policy', files: 'manager', fields: [title('Policy'), f('category', 'Category', 'select', { options: opt(['Privacy', 'Security', 'Accessibility', 'Terms', 'Cookies', 'Acceptable use', 'Other']), filter: true }), f('version', 'Version', 'text', { max: 40 }), f('effective', 'Effective from', 'date'), summary(), bodyField('Policy text')], listFields: ['category', 'version', 'effective'],
        empty: 'Approved policies will be published here. Our current privacy notices are linked below.' }),
      intake('questions', 'Trust and privacy questions', { singular: 'question', cta: 'Ask a question', fields: [nameF(), emailF(), f('topic', 'Topic', 'select', { required: true, options: opt(['Privacy and personal data', 'Data request', 'Security', 'Accessibility', 'Other']), filter: true }), bodyField('Your question')], statuses: S('new', 'in-progress', 'resolved', 'closed') })
    ], links: { category: 'company', description: 'Approved policies and trust information.' } },

  { id: 'learn', company: group, name: 'HN Group Learn', title: 'Staff training and learning', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP LEARN', title: 'Learning for every team.', lead: 'Courses for HN Group staff. Completing a course adds it to your training records in the staff portal automatically.', actions: [{ label: 'Browse courses', href: '#/m/courses' }, { label: 'My training records', href: '#/bridge/training' }] },
    modules: [
      catalog('courses', 'Courses', { singular: 'course', view: 'staff', defaultVisibility: 'staff', intro: 'Courses published for staff.', files: 'manager', completion: { portal: true, provider: 'HN Group Learn' },
        fields: [title('Course'), summary(), f('category', 'Category', 'select', { options: opt(['Induction', 'Security', 'Compliance', 'Technical', 'Leadership', 'Customer', 'Other']), filter: true }), f('duration', 'Time needed', 'text', { max: 60 }), f('link', 'External course link', 'url'), bodyField('Course content')], listFields: ['category', 'duration'],
        empty: 'No courses have been published yet.' }),
      trainingBridge
    ], links: { category: 'staff', description: 'Staff courses, synchronised with staff portal training records.' } },

  { id: 'assets', company: group, logo: 'horizon-holding-co-logo', brand: 'Horizon Holding Co', name: 'HN Group Assets', title: 'Private asset inventory', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HORIZON HOLDING CO', title: 'Group asset inventory.', lead: 'Horizon Holding Co owns the group’s assets, domains, Discord servers and technical assets. This private inventory records them and who looks after each one.', actions: [{ label: 'View inventory', href: '#/m/inventory' }] },
    modules: [records('inventory', 'Inventory', { singular: 'asset', manage: 'admin', create: 'manager', files: 'manager', intro: 'Staff can view the inventory; administrators can add and change assets.',
      fields: [title('Asset'), f('category', 'Category', 'select', { required: true, filter: true, options: opt(['Laptop', 'Desktop', 'Phone', 'Tablet', 'Server', 'Network equipment', 'Peripheral', 'Domain', 'Discord server', 'Hosting / VPS', 'Software account', 'Other']) }), f('tag', 'Asset tag', 'text', { max: 60 }), f('serial', 'Serial number', 'text', { max: 120, internal: true }),
        f('owner', 'Owned by', 'select', { options: COMPANIES, filter: true }), f('assignee', 'Looked after by', 'user'), f('location', 'Location', 'text', { max: 120 }), f('purchased', 'Acquired', 'date'), f('cost', 'Cost (£)', 'money', { internal: true }), f('renewal', 'Warranty or renewal date', 'date'), f('notes', 'Notes', 'textarea', { max: 5000, internal: true })],
      listFields: ['category', 'tag', 'owner', 'assignee', 'renewal'], statuses: S('in-use', 'available', 'repair', 'retired', 'lost'), empty: 'No assets recorded yet.' })], links: { category: 'staff', description: 'Private inventory of group assets owned by Horizon Holding Co.' } },

  { id: 'email', company: group, logo: 'horizon-holding-co-logo', brand: 'Horizon Holding Co', name: 'HN Group Email', title: 'Email services information and assistance', staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP EMAIL', title: 'Email services and help.', lead: 'Horizon Holding Co manages email services for HN Group. Find guidance here and ask for help with your work email.', actions: [{ label: 'Get help', href: '#/m/help/new' }, { label: 'Guides', href: '#/m/guides' }] },
    sections: [{ eyebrow: 'DOMAINS', title: 'Staff email domains', text: 'HN Group staff email addresses use these domains. Treat messages that claim to be from HN Group but come from other domains with caution.', points: ['hngroup.org.uk', 'horizon-network.co.uk', 'horizonadvertising.co.uk', 'media.hngroup.org.uk'] },
      { eyebrow: 'STAY SAFE', title: 'We will never ask for your password', text: 'No one from HN Group will ask for your password or sign-in PIN by email, chat or phone. If a message asks for them, do not reply. Report it here as a suspected phishing message.' }],
    modules: [
      catalog('guides', 'Guides', { singular: 'guide', fields: [title('Guide'), summary(), f('category', 'Category', 'select', { options: opt(['Getting started', 'Mobile devices', 'Security', 'Troubleshooting', 'Other']), filter: true }), bodyField('Guide')], listFields: ['category'], empty: 'No email guides have been published yet.' }),
      records('help', 'Email help requests', { singular: 'request', cta: 'Request help', manage: 'admin', scope: 'own', display: 'table', intro: 'Sign in with your staff account to ask for help. You can see your own requests; administrators handle them.',
        fields: [title('Subject'), f('category', 'Topic', 'select', { required: true, filter: true, options: opt(['Access or sign-in', 'New mailbox', 'Alias or forwarding', 'Sending or receiving problem', 'Suspected phishing', 'Other']) }), f('address', 'Email address concerned', 'email'), bodyField('Details')],
        listFields: ['category', 'address'], statuses: S('open', 'in-progress', 'resolved', 'closed'), empty: 'No help requests yet.' })
    ], links: { category: 'support', description: 'Email service information and help, managed by Horizon Holding Co.' } },

  { id: 'community', company: group, name: 'HN Group Community', title: 'Community forums',
    hero: { eyebrow: 'HN GROUP COMMUNITY', title: 'Community forums.', lead: 'Ask questions, share ideas and talk with others around HN Group. Create a free community account to post.', actions: [{ label: 'Browse discussions', href: '#/forum/forum' }] },
    accounts: { mode: 'register', label: 'Community account', guidelines: GUIDELINES },
    modules: [{ key: 'forum', type: 'forum', title: 'Discussions', manage: 'admin', intro: 'Community discussions. Staff posts are labelled.', categories: forumCategories, guidelines: GUIDELINES }],
    links: { category: 'community', description: 'Community forums with free community accounts.' } },

  { id: 'bookings', company: group, name: 'HN Group Bookings', title: 'Appointments and bookings',
    hero: { eyebrow: 'HN GROUP BOOKINGS', title: 'Book an appointment.', lead: 'Choose an appointment type and a time that suits you. Times are shown in UK time.', actions: [{ label: 'Book an appointment', href: '#/m/types' }, { label: 'Manage a booking', href: '#/ref' }] },
    notices: [NO_EMAIL],
    modules: [
      catalog('types', 'Appointment types', { singular: 'appointment type', intro: 'Choose what you would like to book.',
        fields: [title('Appointment'), summary(), f('duration', 'Length (minutes)', 'number', { required: true, min: 10, max: 480 }), f('days', 'Available days', 'multiselect', { required: true, options: [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']].map(([value, label]) => ({ value, label })) }),
          f('start', 'Daily start (UK time)', 'time', { required: true }), f('end', 'Daily end (UK time)', 'time', { required: true }), f('lead', 'Minimum notice (hours)', 'number', { min: 0, max: 720 }), f('horizon', 'Bookable up to (days ahead)', 'number', { min: 1, max: 365 }), f('location', 'Where', 'text', { max: 160 }), bodyField('Details')],
        listFields: ['duration', 'location'], empty: 'No appointments are available to book yet.' }),
      intake('appointments', 'Bookings', { singular: 'booking', slots: true, parent: { module: 'types', label: 'Appointment', cta: 'Book' }, cancellable: ['requested', 'confirmed'], successTitle: 'Booking requested',
        successText: 'Your booking request has been recorded. We will confirm it here — check with your private reference.',
        fields: [f('date', 'Date', 'date', { required: true }), f('time', 'Time', 'time', { required: true }), nameF(), emailF(), f('phone', 'Phone (optional)', 'text', { max: 40, contact: true }), f('notes', 'Anything we should know?', 'textarea', { max: 2000 })],
        listFields: ['date', 'time', 'name'], statuses: S('requested', 'confirmed', 'completed', 'cancelled') })
    ], links: { category: 'company', description: 'Book appointments in UK time.' } },

  { id: 'forms', company: group, name: 'HN Group Forms', title: 'Branded forms and submissions', staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP FORMS', title: 'Forms.', lead: 'Branded forms from HN Group. Staff administrators build forms, and submissions are collected securely here.', actions: [{ label: 'Open forms', href: '#/b/forms' }] },
    modules: [{ key: 'forms', type: 'builder', mode: 'form', title: 'Forms', manage: 'admin', intro: 'Forms that are currently open.', empty: 'No forms are open at the moment.' }],
    links: { category: 'resources', description: 'Branded forms with secure submissions.' } },

  { id: 'surveys', company: group, name: 'HN Group Surveys', title: 'Surveys and results', staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP SURVEYS', title: 'Surveys and results.', lead: 'Have your say in HN Group surveys. Some surveys share their results publicly once you respond. Staff also see staff polls from the staff portal.', actions: [{ label: 'Open surveys', href: '#/b/surveys' }] },
    modules: [{ key: 'surveys', type: 'builder', mode: 'survey', title: 'Surveys', manage: 'admin', intro: 'Surveys that are currently open.', empty: 'No surveys are open at the moment.' }, pollsBridge],
    links: { category: 'resources', description: 'Surveys with shareable results, plus staff polls.' } },

  { id: 'suppliers', company: group, name: 'HN Group Suppliers', title: 'Supplier management', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP SUPPLIERS', title: 'Supplier management.', lead: 'The group’s supplier directory, with contacts, contracts and review status. Supplier bills come from the staff portal.', actions: [{ label: 'Suppliers', href: '#/m/directory' }] },
    modules: [records('directory', 'Suppliers', { singular: 'supplier', manage: 'admin', create: 'manager', files: 'manager', filesTitle: 'Contracts and documents', intro: 'Staff can view suppliers; administrators maintain the directory.',
      fields: [title('Supplier'), f('category', 'Category', 'select', { filter: true, options: opt(['Hosting & infrastructure', 'Software', 'Hardware', 'Domains', 'Professional services', 'Marketing', 'Office', 'Other']) }), f('website', 'Website', 'url'), f('contact', 'Contact name', 'text', { max: 120 }), f('contactEmail', 'Contact email', 'email', { internal: true }), f('phone', 'Phone', 'text', { max: 40, internal: true }),
        f('usedBy', 'Used by', 'multiselect', { options: COMPANIES }), f('account', 'Account reference', 'text', { max: 120, internal: true }), f('review', 'Next review', 'date'), f('notes', 'Notes', 'textarea', { max: 5000, internal: true })],
      listFields: ['category', 'contact', 'review'], statuses: S('active', 'under-review', 'inactive'), empty: 'No suppliers recorded yet.' }), billsBridge()],
    links: { category: 'staff', description: 'Supplier directory with portal bills.' } },

  { id: 'procurement', company: group, name: 'HN Group Procurement', title: 'Purchase requests and approvals', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP PROCUREMENT', title: 'Purchase requests and approvals.', lead: 'Request a purchase, get it approved by an administrator, then record it as a bill in the staff portal so finance tracks it in one place.', actions: [{ label: 'New request', href: '#/m/requests/new' }, { label: 'Requests', href: '#/m/requests' }] },
    modules: [records('requests', 'Purchase requests', { singular: 'purchase request', cta: 'New request', manage: 'admin', scope: 'own', portalBill: { supplier: 'supplier', amount: 'amount' }, cancellable: ['submitted'],
      approval: { decisions: ['approved', 'rejected'], by: 'admin', noSelf: true }, transitions: { submitted: ['approved', 'rejected'], approved: ['ordered', 'cancelled'], ordered: ['received'], received: [], rejected: [], cancelled: [] },
      intro: 'You see your own requests; administrators see all and approve them. No one can approve their own request.',
      fields: [title('What is needed'), f('supplier', 'Supplier', 'text', { required: true, max: 120 }), f('amount', 'Cost (£)', 'money', { required: true }), f('company', 'Paid by', 'select', { required: true, options: COMPANIES, filter: true }), f('needed', 'Needed by', 'date'), f('link', 'Product or quote link', 'url'), f('justification', 'Why it is needed', 'textarea', { required: true, max: 5000 })],
      listFields: ['supplier', 'amount', 'company', 'needed'], statuses: S('submitted', 'approved', 'rejected', 'ordered', 'received', 'cancelled'), empty: 'No purchase requests yet.' }),
      billsBridge()],
    links: { category: 'staff', description: 'Purchase requests with approvals and portal bills.' } },

  { id: 'expenses', company: group, name: 'HN Group Expenses', title: 'Expense submissions and approvals', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP EXPENSES', title: 'Expenses, simply.', lead: 'Submit expense and mileage claims with receipts, and approve claims for your team. Claims are the same records as in the staff portal.', actions: [{ label: 'My claims', href: '#/bridge/claims' }, { label: 'Submit a claim', href: '#/bridge/claims/form/claim' }] },
    modules: [expensesBridge], links: { category: 'staff', description: 'Expense claims and approvals, synchronised with the staff portal.' } },

  { id: 'licenses', company: group, name: 'HN Group Licences', title: 'Software licences and renewals', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP LICENCES', title: 'Software licences and renewals.', lead: 'Every software licence and subscription the group holds, with seats, costs and renewal dates.', actions: [{ label: 'Licences', href: '#/m/licences' }] },
    modules: [records('licences', 'Licences', { singular: 'licence', manage: 'admin', create: 'manager', files: 'manager', intro: 'Sorted with the next renewals first in each view. Staff can view; administrators maintain licences.',
      fields: [title('Software'), f('vendor', 'Vendor', 'text', { max: 120 }), f('kind', 'Licence type', 'select', { filter: true, options: opt(['Subscription', 'Perpetual', 'Open source', 'Trial', 'Free plan']) }), f('seats', 'Seats', 'number', { min: 0, max: 100000 }), f('cost', 'Cost (£)', 'money', { internal: true }), f('billing', 'Billing', 'select', { options: opt(['Monthly', 'Annual', 'One-off', 'None']) }),
        f('renewal', 'Renewal date', 'date'), f('owner', 'Licence owner', 'user'), f('company', 'Held by', 'select', { options: COMPANIES, filter: true }), f('account', 'Account reference', 'text', { max: 160, internal: true }), f('notes', 'Notes', 'textarea', { max: 5000, internal: true })],
      listFields: ['vendor', 'seats', 'renewal', 'owner'], statuses: S('active', 'renewal-due', 'expired', 'cancelled'), empty: 'No licences recorded yet.' })],
    links: { category: 'staff', description: 'Software licences with renewal tracking.' } },

  { id: 'developers', company: group, name: 'HN Group Developers', title: 'Developer documentation and API information',
    hero: { eyebrow: 'HN GROUP DEVELOPERS', title: 'Developer documentation.', lead: 'Guides, references and API information for building with HN Group services. Documentation appears here as it is published.', actions: [{ label: 'Documentation', href: '#/m/docs' }, { label: 'Ask a question', href: '#/m/questions/new' }] },
    notices: [NO_EMAIL],
    modules: [
      catalog('docs', 'Documentation', { singular: 'document', files: 'manager', fields: [title(), f('category', 'Section', 'select', { filter: true, options: opt(['Getting started', 'Guides', 'API reference', 'Changelog']) }), f('version', 'Applies to version', 'text', { max: 40 }), summary(), bodyField('Content')], listFields: ['category', 'version'], empty: 'No developer documentation has been published yet. API documentation will be published here when it is available.' }),
      intake('questions', 'Developer questions', { singular: 'question', cta: 'Ask a question', fields: [nameF(), emailF(), title('Subject'), bodyField('Your question')], statuses: S('new', 'in-progress', 'resolved', 'closed') })
    ], links: { category: 'resources', description: 'Developer documentation and API information.' } },

  { id: 'labs', company: group, name: 'HN Group Labs', title: 'Experiments and previews', staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP LABS', title: 'Experiments and previews.', lead: 'Early ideas and previews from across HN Group. Things here may change or disappear — tell us what you think.', actions: [{ label: 'Experiments', href: '#/m/experiments' }] },
    notices: [NO_EMAIL],
    modules: [
      catalog('experiments', 'Experiments', { singular: 'experiment', intro: 'Some experiments are visible to staff only.', fields: [title('Experiment'), summary(), f('stage', 'Stage', 'select', { filter: true, options: opt(['Idea', 'Prototype', 'Preview', 'Retired']) }), company('From'), f('link', 'Try it', 'url'), bodyField('About')], listFields: ['stage', 'company'], empty: 'No experiments are public at the moment.' }),
      intake('reactions', 'Experiment feedback', { singular: 'feedback', parent: { module: 'experiments', label: 'Experiment', cta: 'Give feedback' }, fields: [f('rating', 'How useful is this?', 'select', { options: opt(['Very useful', 'Somewhat useful', 'Not useful']) }), bodyField('Your feedback'), f('name', 'Name (optional)', 'text', { max: 120 }), emailF(false)], statuses: S('new', 'reviewing', 'closed') })
    ], links: { category: 'resources', description: 'Experiments and previews from across the group.' } },

  { id: 'reports', company: group, name: 'HN Group Reports', title: 'Private reports and dashboards', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP REPORTS', title: 'Reports and dashboards.', lead: 'Live monthly figures from the staff portal, live website health across the group, and a library of published reports.', actions: [{ label: 'Monthly report', href: '#/bridge/monthly' }, { label: 'Website health', href: '#/health/health' }] },
    modules: [reportsBridge, { key: 'health', type: 'health', title: 'Website health', intro: 'Whether each HN Group website process on the server is responding right now.' },
      records('library', 'Report library', { singular: 'report', manage: 'admin', create: 'manager', files: 'manager', display: 'cards', fields: [title('Report'), f('period', 'Period', 'text', { max: 60 }), company('Company'), summary(), bodyField('Findings')], listFields: ['period', 'company'], statuses: S('draft', 'published'), empty: 'No reports have been added to the library yet.' })],
    links: { category: 'staff', description: 'Monthly staff report, website health and report library.' } },

  { id: 'sign', company: group, name: 'HN Group Sign', title: 'Document signing workflows', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP SIGN', title: 'Document signing.', lead: 'Send a PDF for signature with private links, track who has signed, and download a full signing record.', actions: [{ label: 'Signing requests', href: '#/signing/documents' }] },
    modules: [{ key: 'documents', type: 'sign', title: 'Signing requests', intro: 'Only you (and administrators) can see the requests you create.', disclaimer: 'Signatures here are simple electronic acknowledgements: signers confirm by typing their name through a private link. HN Group does not verify their identity beyond possession of that link, and this is not a qualified or advanced electronic signature. Consider whether that is appropriate for your document.' }],
    links: { category: 'staff', description: 'PDF signing requests with a full signing record.' } },

  { id: 'vault', company: group, name: 'HN Group Vault', title: 'Private staff files', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HN GROUP VAULT', title: 'Your private files.', lead: 'A private space for your work files. Only you can see files you upload here — not even administrators. HR documents shared with you in the staff portal appear here too.', actions: [{ label: 'My files', href: '#/m/files' }, { label: 'HR documents', href: '#/bridge/hrfiles' }] },
    modules: [records('files', 'My files', { singular: 'file', private: true, files: 'creator', comments: false, display: 'cards', cta: 'Add files', intro: 'Private to you. Files can be up to 10 MB each.', fields: [title('Name'), f('category', 'Folder', 'text', { max: 60, filter: false }), f('notes', 'Notes', 'textarea', { max: 2000 })], listFields: ['category'], empty: 'You have not stored any files yet.' }), staffFilesBridge],
    links: { category: 'staff', description: 'Private files for each staff member, plus shared HR documents.' } },

  { id: 'security', company: group, name: 'HN Group Security', title: 'Security information and vulnerability reporting',
    hero: { eyebrow: 'HN GROUP SECURITY', title: 'Report a security issue.', lead: 'If you believe you have found a security vulnerability in an HN Group website or service, please tell us privately here.', actions: [{ label: 'Report a vulnerability', href: '#/m/reports/new' }, { label: 'Check a report', href: '#/ref' }] },
    securityTxt: { module: 'reports' },
    notices: [NO_EMAIL],
    sections: [{ eyebrow: 'HOW TO HELP', title: 'When you report', text: 'Please give enough detail for us to reproduce the issue, and avoid accessing, changing or keeping other people’s data. Do not run tests that could disrupt services, and give us time to investigate before sharing details publicly. You will receive a private reference to follow progress and talk with us.' },
      { eyebrow: 'NOT SECURITY?', title: 'Other problems', text: 'For account help or general bugs, use HN Group Support or Feedback instead.', link: { url: 'https://support.hngroup.org.uk', label: 'HN Group Support' } }],
    modules: [
      intake('reports', 'Vulnerability reports', { singular: 'report', cta: 'Report a vulnerability', successTitle: 'Report received', successText: 'Thank you for reporting this privately.', internalNotes: true,
        fields: [title('Summary'), f('target', 'Affected website, service or address', 'text', { required: true, max: 300 }), f('severity', 'Your severity assessment', 'select', { options: opt(['Low', 'Medium', 'High', 'Critical', 'Not sure']), filter: true }), bodyField('Description'), f('steps', 'Steps to reproduce', 'textarea', { max: 10000 }), f('impact', 'Potential impact', 'textarea', { max: 5000 }), f('name', 'Name or handle (optional)', 'text', { max: 120 }), emailF(false)],
        listFields: ['target', 'severity'], statuses: S('new', 'triaging', 'confirmed', 'fixed', 'not-applicable', 'closed') }),
      catalog('advisories', 'Security advisories', { singular: 'advisory', fields: [title('Advisory'), f('published', 'Published', 'date'), f('severity', 'Severity', 'select', { options: opt(['Low', 'Medium', 'High', 'Critical']) }), f('affected', 'Affected', 'text', { max: 300 }), summary(), bodyField('Details')], listFields: ['published', 'severity'], empty: 'No security advisories have been published.' })
    ], links: { category: 'support', description: 'Security information and private vulnerability reporting.' } },

  { id: 'competitions', company: group, name: 'HN Group Competitions', title: 'Competitions and entries',
    hero: { eyebrow: 'HN GROUP COMPETITIONS', title: 'Competitions.', lead: 'Enter HN Group competitions. Each competition lists its closing date, prize and rules.', actions: [{ label: 'Open competitions', href: '#/m/competitions' }] },
    notices: [NO_EMAIL],
    modules: [
      catalog('competitions', 'Competitions', { singular: 'competition', fields: [title('Competition'), summary(), f('opens', 'Opens', 'date'), f('closes', 'Closes', 'datetime', { required: true }), f('prize', 'Prize', 'text', { max: 200 }), f('eligibility', 'Who can enter', 'textarea', { max: 3000 }), bodyField('Rules')], listFields: ['closes', 'prize'], empty: 'There are no competitions open at the moment.' }),
      intake('entries', 'Entries', { singular: 'entry', parent: { module: 'competitions', label: 'Competition', cta: 'Enter', closes: 'closes', unique: 'email' }, files: 'creator', fileLabel: 'Attach your entry (optional, up to 10 MB)', fileTypes: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'zip', 'docx', 'pptx', 'mp3', 'mp4'],
        fields: [nameF(), emailF(), f('entry', 'Your entry', 'textarea', { required: true, max: 10000 }), f('link', 'Link (optional)', 'url'), f('rules', 'I have read and accept the competition rules', 'checkbox', { required: true })], statuses: S('received', 'shortlisted', 'winner', 'not-selected', 'withdrawn'), cancellable: ['received'] })
    ], links: { category: 'community', description: 'Competitions and entries.' } },

  { id: 'members', company: group, name: 'HN Group Members', title: 'Memberships and member services',
    hero: { eyebrow: 'HN GROUP MEMBERS', title: 'Membership.', lead: 'Apply for HN Group membership. Approved members get a member account with member resources and a private way to request member services.', actions: [{ label: 'Apply', href: '#/m/applications/new' }, { label: 'Member sign in', href: '#/account' }] },
    accounts: { mode: 'invite', label: 'Member account', memberships: true },
    notices: [NO_EMAIL],
    modules: [
      intake('applications', 'Membership applications', { singular: 'application', cta: 'Apply for membership', invite: { status: 'approved' }, fields: [nameF(), emailF(), f('organisation', 'Organisation (optional)', 'text', { max: 160 }), f('reason', 'Why would you like to join?', 'textarea', { required: true, max: 3000 })], statuses: S('new', 'reviewing', 'approved', 'declined') }),
      catalog('resources', 'Member resources', { singular: 'resource', view: 'members', defaultVisibility: 'members', membersVisibility: true, files: 'manager', intro: 'Resources for members.', fields: [title('Resource'), summary(), f('link', 'Link', 'url'), bodyField('Details')], empty: 'No member resources have been published yet.' }),
      { key: 'requests', type: 'items', title: 'Member services', singular: 'request', cta: 'Request a member service', view: 'members', create: 'account', manage: 'admin', scope: 'own', comments: true, display: 'table', intro: 'Ask for member services. Only you and our team can see your requests.', fields: [title('Subject'), bodyField('Details')], statuses: S('open', 'in-progress', 'resolved', 'closed'), empty: 'You have not made any requests yet.', staffOnly: false }
    ], links: { category: 'community', description: 'Membership applications, member accounts and member services.' } },

  // ===================== Horizon Network =====================
  { id: 'hosting', company: network, domain: 'hosting.horizon-network.co.uk', name: 'Horizon Hosting', title: 'Hosting information and requests',
    hero: { eyebrow: 'HORIZON HOSTING', title: 'Hosting from Horizon Network.', lead: 'Horizon Hosting is Horizon Network’s planned hosting service, offering VPS, dedicated servers and managed cloud. It is coming soon — register your requirements now.', actions: [{ label: 'Hosting options', href: '#/m/plans' }, { label: 'Make a request', href: '#/m/requests/new' }] },
    providers: { provisioning: { label: 'Automatic server provisioning', status: 'awaiting-configuration', note: 'No hosting provisioning system is connected. Requests are reviewed by the team; nothing is created automatically.' } },
    notices: [NO_EMAIL],
    modules: [
      catalog('plans', 'Hosting options', { singular: 'option', fields: [title('Option'), f('availability', 'Availability', 'select', { options: [{ value: 'coming-soon', label: 'Coming soon' }, { value: 'available', label: 'Available' }], filter: true }), summary(), bodyField('Details')], listFields: ['availability'],
        seed: [{ id: 'plan-vps', fields: { title: 'VPS', availability: 'coming-soon', summary: 'Virtual private servers.', body: 'Part of Horizon Hosting, coming soon.' } }, { id: 'plan-dedicated', fields: { title: 'Dedicated servers', availability: 'coming-soon', summary: 'Dedicated server hosting.', body: 'Part of Horizon Hosting, coming soon.' } }, { id: 'plan-cloud', fields: { title: 'Managed cloud', availability: 'coming-soon', summary: 'Managed cloud hosting.', body: 'Part of Horizon Hosting, coming soon.' } }] }),
      intake('requests', 'Hosting requests', { singular: 'request', consent: NET_PRIVACY, parent: { module: 'plans', label: 'Hosting option', cta: 'Request this' }, successTitle: 'Request received',
        fields: [nameF(), emailF(), f('organisation', 'Organisation', 'text', { max: 160 }), f('start', 'When do you need it?', 'select', { options: opt(['As soon as available', 'Within 3 months', 'Later', 'Just exploring']) }), bodyField('Your requirements')], listFields: ['organisation', 'start'], statuses: S('new', 'reviewing', 'contacted', 'closed') })
    ], links: { category: 'network', description: 'Horizon Hosting information and requests (coming soon).' } },

  { id: 'panel', company: network, domain: 'panel.horizon-network.co.uk', name: 'Horizon Network Panel', title: 'Hosting control panel', staffOnly: true, staffSignIn: 'any',
    hero: { eyebrow: 'HORIZON NETWORK PANEL', title: 'Hosting control panel.', lead: 'For authorised Horizon Network staff: the register of hosting services and their status. Automatic provisioning is not connected yet.', actions: [{ label: 'Services', href: '#/m/services' }] },
    providers: { provisioning: { label: 'Provisioning system', status: 'awaiting-configuration', note: 'Not connected. Status changes here are records kept by staff; they do not create, start or stop any server.' } },
    modules: [records('services', 'Hosting services', { singular: 'service', manage: 'admin', create: 'manager', intro: 'Staff can view; administrators maintain records. Changing a status here does not act on any server.',
      fields: [title('Service name'), f('customer', 'Customer', 'text', { max: 160 }), f('kind', 'Type', 'select', { filter: true, options: opt(['VPS', 'Dedicated server', 'Managed cloud', 'Website hosting', 'Other']) }), f('hostname', 'Hostname', 'text', { max: 200, internal: true }), f('location', 'Location', 'text', { max: 120 }), f('renewal', 'Renewal date', 'date'), f('notes', 'Notes', 'textarea', { max: 5000, internal: true })],
      listFields: ['customer', 'kind', 'renewal'], statuses: S('requested', 'awaiting-provider', 'active', 'suspended', 'cancelled'), empty: 'No hosting services are recorded.' })],
    links: { category: 'network', description: 'Authorised hosting control panel for Network staff.' } },

  { id: 'netstatus', company: network, domain: 'status.horizon-network.co.uk', name: 'Horizon Network Status', title: 'Network service status', staffSignIn: 'admin',
    hero: { eyebrow: 'HORIZON NETWORK STATUS', title: 'Network service status.', lead: 'Live status of Horizon Network websites and services, checked every minute.', actions: [{ label: 'Current status', href: '#/status/components' }] },
    modules: [{ key: 'components', type: 'status', title: 'Service status', manage: 'admin', intro: 'Checked automatically every minute.',
      seed: [['net-site', 'Horizon Network website', 'https://horizon-network.co.uk/'], ['net-hosting', 'Hosting information', 'https://hosting.horizon-network.co.uk/healthz'], ['net-domains', 'Domain services', 'https://domains.horizon-network.co.uk/healthz'], ['net-order', 'Ordering', 'https://order.horizon-network.co.uk/healthz'], ['net-my', 'Customer accounts', 'https://my.horizonetwork.com/healthz'], ['net-ads', 'Advertising enquiries', 'https://ads.horizonetwork.com/healthz'], ['net-dev', 'Developer resources', 'https://developers.horizonetwork.com/healthz'], ['net-community', 'Community', 'https://community.horizonetwork.com/healthz']].map(([id, name, url]) => ({ id, name, url, group: 'Websites' })) }],
    links: { category: 'network', description: 'Live status of Horizon Network services.' } },

  { id: 'domains', company: network, domain: 'domains.horizon-network.co.uk', name: 'Horizon Network Domains', title: 'Domain services and requests',
    hero: { eyebrow: 'HORIZON NETWORK DOMAINS', title: 'Domain services.', lead: 'Ask Horizon Network for help registering, transferring or managing a domain name. Requests are reviewed by our team.', actions: [{ label: 'Request domain help', href: '#/m/requests/new' }] },
    providers: { registrar: { label: 'Domain registrar', status: 'awaiting-configuration', note: 'No registrar is connected, so domains are not registered or transferred automatically. Nothing is registered until the team confirms it with you.' } },
    notices: [NO_EMAIL],
    modules: [intake('requests', 'Domain requests', { singular: 'request', consent: NET_PRIVACY, cta: 'Request domain help', successTitle: 'Request received', successText: 'We have your request. This does not register or reserve a domain.',
      fields: [f('domain', 'Domain name', 'text', { required: true, max: 253, help: 'For example example.co.uk' }), f('service', 'What do you need?', 'select', { required: true, filter: true, options: opt(['Register a new domain', 'Transfer a domain', 'Renew a domain', 'DNS help', 'Other']) }), nameF(), emailF(), f('organisation', 'Organisation', 'text', { max: 160 }), bodyField('Anything else')],
      listFields: ['domain', 'service'], statuses: S('new', 'reviewing', 'awaiting-registrar', 'contacted', 'closed') })],
    links: { category: 'network', description: 'Domain registration, transfer and DNS requests.' } },

  { id: 'netdevelopers', company: network, domain: 'developers.horizonetwork.com', name: 'Horizon Network Developers', title: 'Network developer resources',
    hero: { eyebrow: 'HORIZON NETWORK DEVELOPERS', title: 'Developer resources.', lead: 'Documentation and resources for building on Horizon Network services, published here as they become available.', actions: [{ label: 'Documentation', href: '#/m/docs' }, { label: 'Ask a question', href: '#/m/questions/new' }] },
    notices: [NO_EMAIL],
    modules: [
      catalog('docs', 'Documentation', { singular: 'document', files: 'manager', fields: [title(), f('category', 'Section', 'select', { filter: true, options: opt(['Getting started', 'Guides', 'API reference', 'Changelog']) }), f('version', 'Version', 'text', { max: 40 }), summary(), bodyField('Content')], listFields: ['category', 'version'], empty: 'No Horizon Network developer documentation has been published yet.' }),
      intake('questions', 'Developer questions', { singular: 'question', consent: NET_PRIVACY, cta: 'Ask a question', fields: [nameF(), emailF(), title('Subject'), bodyField('Your question')], statuses: S('new', 'in-progress', 'resolved', 'closed') })
    ], links: { category: 'network', description: 'Horizon Network developer documentation.' } },

  { id: 'showcase', company: network, domain: 'showcase.horizonetwork.com', name: 'Horizon Network Showcase', title: 'Projects and portfolio',
    hero: { eyebrow: 'HORIZON NETWORK SHOWCASE', title: 'Our work.', lead: 'Projects from Horizon Network, Horizon Development and Horizon Advertising.', actions: [{ label: 'View projects', href: '#/m/projects' }] },
    modules: [catalog('projects', 'Projects', { singular: 'project', files: 'manager', fields: [title('Project'), f('team', 'By', 'select', { options: ['Horizon Network', 'Horizon Development', 'Horizon Advertising'], filter: true }), f('category', 'Category', 'select', { filter: true, options: opt(['Infrastructure', 'Web application', 'Software', 'Advertising campaign', 'Other']) }), f('client', 'Client (with permission)', 'text', { max: 160 }), f('link', 'Link', 'url'), f('completed', 'Completed', 'date'), summary(), bodyField('About the project')],
      listFields: ['team', 'category', 'completed'], empty: 'No projects have been published yet.' })],
    links: { category: 'network', description: 'Projects and portfolio from Horizon Network.' } },

  { id: 'ads', company: network, domain: 'ads.horizonetwork.com', logo: 'horizon-advertising-logo', brand: 'Horizon Advertising', name: 'Horizon Advertising Services', title: 'Advertising services and enquiries',
    hero: { eyebrow: 'HORIZON ADVERTISING', title: 'Advertising that reaches people.', lead: 'Digital advertising solutions from Horizon Advertising, managed by Horizon Network: display advertising, campaign management, analytics and reporting.', actions: [{ label: 'Our services', href: '#/m/services' }, { label: 'Make an enquiry', href: '#/m/enquiries/new' }] },
    sections: [{ eyebrow: 'WHO WE ARE', title: 'Ownership and management', text: 'Horizon Advertising is a subsidiary of Horizon Media Group and is managed by Horizon Network. Both are part of HN Group.', link: { url: 'https://horizonadvertising.co.uk', label: 'horizonadvertising.co.uk' } }],
    notices: [NO_EMAIL],
    footerText: 'Horizon Advertising is a subsidiary of Horizon Media Group and is managed by Horizon Network.',
    modules: [
      catalog('services', 'Advertising services', { singular: 'service', fields: [title('Service'), summary(), bodyField('Details')],
        seed: [{ id: 'ad-display', fields: { title: 'Display advertising', summary: 'Reaching audiences with display advertising.', body: '' } }, { id: 'ad-campaigns', fields: { title: 'Campaign management', summary: 'Planning and running advertising campaigns.', body: '' } }, { id: 'ad-analytics', fields: { title: 'Analytics and reporting', summary: 'Measuring results with clear reporting.', body: '' } }] }),
      intake('enquiries', 'Advertising enquiries', { singular: 'enquiry', consent: NET_PRIVACY, cta: 'Make an enquiry', successTitle: 'Enquiry received',
        fields: [nameF(), emailF(), f('organisation', 'Organisation', 'text', { max: 160 }), f('website', 'Website', 'url'), f('interest', 'Interested in', 'multiselect', { options: opt(['Display advertising', 'Campaign management', 'Analytics and reporting']) }), f('budget', 'Budget (optional)', 'text', { max: 80 }), bodyField('Your goals')], listFields: ['organisation', 'interest'], statuses: S('new', 'reviewing', 'contacted', 'closed') })
    ], links: { category: 'network', description: 'Horizon Advertising services and enquiries.' } },

  { id: 'tools', company: network, domain: 'tools.horizonetwork.com', name: 'Horizon Network Tools', title: 'Useful working tools',
    hero: { eyebrow: 'HORIZON NETWORK TOOLS', title: 'Useful working tools.', lead: 'Free tools for everyday work — password and UUID generators, colour contrast, JSON, encoding, checksums, time zones and subnets. Everything runs in your browser; nothing you type is sent to us.', actions: [{ label: 'Open tools', href: '#/tools' }] },
    tools: true, modules: [], links: { category: 'network', description: 'Free browser-based working tools.' } },

  { id: 'sandbox', company: network, domain: 'sandbox.horizonetwork.com', name: 'Horizon Network Sandbox', title: 'Controlled previews and experiments', staffSignIn: 'any',
    hero: { eyebrow: 'HORIZON NETWORK SANDBOX', title: 'Previews and experiments.', lead: 'Controlled previews of work in progress from Horizon Network. Some previews are for staff only.', actions: [{ label: 'Previews', href: '#/m/previews' }] },
    notices: [NO_EMAIL],
    modules: [
      catalog('previews', 'Previews', { singular: 'preview', intro: 'Previews may change, break or be removed at any time.', fields: [title('Preview'), summary(), f('stage', 'Stage', 'select', { filter: true, options: opt(['Prototype', 'Preview', 'Ended']) }), f('link', 'Open preview', 'url'), f('ends', 'Available until', 'date'), bodyField('About')], listFields: ['stage', 'ends'], empty: 'No previews are public at the moment.' }),
      intake('feedback', 'Preview feedback', { singular: 'feedback', consent: NET_PRIVACY, parent: { module: 'previews', label: 'Preview', cta: 'Give feedback' }, fields: [bodyField('Your feedback'), f('name', 'Name (optional)', 'text', { max: 120 }), emailF(false)], statuses: S('new', 'reviewing', 'closed') })
    ], links: { category: 'network', description: 'Controlled previews and experiments.' } },

  { id: 'order', company: network, domain: 'order.horizon-network.co.uk', name: 'Horizon Network Order', title: 'Service ordering',
    hero: { eyebrow: 'HORIZON NETWORK ORDER', title: 'Order a service.', lead: 'Choose a Horizon Network service and place an order. We confirm every order with you before anything is charged or set up.', actions: [{ label: 'Services', href: '#/m/products' }, { label: 'Check an order', href: '#/ref' }] },
    providers: { payments: { label: 'Online payments', status: 'awaiting-configuration', note: 'No payment provider is connected. Placing an order does not take payment; we will contact you to confirm and arrange payment.' } },
    notices: [NO_EMAIL],
    modules: [
      catalog('products', 'Services to order', { singular: 'service', fields: [title('Service'), summary(), f('price', 'Price', 'text', { max: 120, help: 'As agreed and published by the team' }), bodyField('What is included')], listFields: ['price'], empty: 'No services are available to order online yet. Contact Horizon Network or request hosting on hosting.horizon-network.co.uk.' }),
      intake('orders', 'Orders', { singular: 'order', consent: NET_PRIVACY, parent: { module: 'products', label: 'Service', cta: 'Order' }, cancellable: ['received'], successTitle: 'Order received', successText: 'Your order has been received. No payment has been taken. We will confirm details with you here.',
        fields: [nameF(), emailF(), f('organisation', 'Organisation', 'text', { max: 160 }), f('quantity', 'Quantity', 'number', { min: 1, max: 1000 }), f('address', 'Billing address', 'textarea', { max: 600, contact: true }), bodyField('Requirements')], listFields: ['organisation', 'quantity'], statuses: S('received', 'confirmed', 'in-progress', 'completed', 'cancelled') })
    ], links: { category: 'network', description: 'Order Horizon Network services (no online payment yet).' } },

  { id: 'my', company: network, domain: 'my.horizonetwork.com', name: 'My Horizon Network', title: 'Customer account and services',
    hero: { eyebrow: 'MY HORIZON NETWORK', title: 'Your account.', lead: 'Horizon Network customers can sign in to see their services and send requests. Accounts are created by invitation from our team.', actions: [{ label: 'Sign in', href: '#/account' }, { label: 'My services', href: '#/m/services' }] },
    accounts: { mode: 'invite', label: 'Customer account' },
    modules: [
      { key: 'services', type: 'items', title: 'My services', singular: 'service', view: 'account', scope: 'own', create: 'manager', manage: 'admin', comments: true, display: 'table', intro: 'Services on your account. Ask us if anything looks wrong.',
        fields: [f('customer', 'Customer account', 'account', { required: true }), title('Service'), f('kind', 'Type', 'select', { options: opt(['Hosting', 'Domain', 'Development', 'Advertising', 'Support', 'Other']) }), f('renewal', 'Renewal date', 'date'), f('notes', 'Internal notes', 'textarea', { max: 5000, internal: true })], listFields: ['kind', 'renewal'], statuses: S('pending', 'active', 'suspended', 'cancelled'), empty: 'No services are on your account yet.' },
      { key: 'requests', type: 'items', title: 'Requests', singular: 'request', view: 'account', scope: 'own', create: 'account', manage: 'admin', comments: true, display: 'table', cta: 'New request', intro: 'Questions or changes for your services.',
        fields: [title('Subject'), bodyField('Details')], statuses: S('open', 'in-progress', 'resolved', 'closed'), empty: 'You have not made any requests.' }
    ], links: { category: 'network', description: 'Horizon Network customer accounts (by invitation).' } },

  { id: 'netcommunity', company: network, domain: 'community.horizonetwork.com', name: 'Horizon Network Community', title: 'Network community',
    hero: { eyebrow: 'HORIZON NETWORK COMMUNITY', title: 'Network community.', lead: 'Talk about Horizon Network services, hosting, development and more. Create a free community account to post.', actions: [{ label: 'Browse discussions', href: '#/forum/forum' }] },
    accounts: { mode: 'register', label: 'Community account', guidelines: GUIDELINES },
    modules: [{ key: 'forum', type: 'forum', title: 'Discussions', manage: 'admin', intro: 'Community discussions. Horizon Network staff posts are labelled.', categories: [{ id: 'general', label: 'General' }, { id: 'hosting', label: 'Hosting' }, { id: 'development', label: 'Development' }, { id: 'help', label: 'Help & questions' }, { id: 'showcase', label: 'Show & tell' }], guidelines: GUIDELINES }],
    staffLabel: 'Horizon Network', links: { category: 'network', description: 'Horizon Network community forums.' } }
];

module.exports = { sites, COMPANIES };
