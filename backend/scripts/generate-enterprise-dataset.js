// Generates backend/data/enterprise/*.csv: the demo organization (Harbor & Pine Co.) grown to a
// realistic mid-size company so pagination, filters, search and rendering can be exercised with
// volume. Everything is fictional. The output is deterministic (seeded generator), so re-running
// this script with the same inputs produces byte-identical files and the folder can be reviewed
// in Git like any other data.
//
// Design rules:
// - The demo CSVs are copied verbatim first, so every person, skill and story the demo relies on
//   (Liam Chen, Legacy Billing Recovery, Payments Compliance, Cybersecurity, AI Governance) keeps
//   the same coverage. Generated people never hold those four "story" skills.
// - Generated people follow the same invariants as the demo: proficiency 1-5, absent evidence
//   stays blank (unknown, never zero), every row carries a provenance, reporting lines never loop.
// - Evidence is deliberately imperfect: some records are unverified, some verified long ago, so
//   the data-quality rules, the stale-evidence setting and the trust labels all have real work.
//
// Run from backend/:  node scripts/generate-enterprise-dataset.js
// Then seed:          npm run seed:enterprise   (stop the backend first)
const fs = require('node:fs');
const path = require('node:path');
const { readCsvTable } = require('../data/csv');

const DEMO_DIR = path.join(__dirname, '..', 'data', 'demo');
const OUT_DIR = path.join(__dirname, '..', 'data', 'enterprise');
const PROVENANCE = 'Fictional enterprise dataset (generated)';
const TODAY = new Date('2026-09-13T00:00:00Z');
const STORY_SKILLS = new Set(['Legacy Billing Recovery', 'Payments Compliance', 'Cybersecurity', 'AI Governance']);

// ---- deterministic randomness (mulberry32) ----
function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (probability) => next() < probability,
    shuffle: (list) => {
      const copy = [...list];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(next() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
      }
      return copy;
    },
  };
}
const random = createRandom(20260913);

// ---- vocabulary ----
const FIRST_NAMES = [
  'Aaliyah', 'Adrian', 'Aisha', 'Alejandro', 'Amara', 'Andrei', 'Anika', 'Arjun', 'Beatriz', 'Benjamin', 'Bianca', 'Callum',
  'Camila', 'Caleb', 'Chiara', 'Daniel', 'Dario', 'Delphine', 'Dmitri', 'Elena', 'Elias', 'Emeka', 'Esther', 'Farah', 'Felix',
  'Fiona', 'Gabriel', 'Gianna', 'Hannah', 'Hiroshi', 'Ibrahim', 'Imani', 'Ingrid', 'Isabel', 'Jonas', 'Julia', 'Kai', 'Kenji',
  'Layla', 'Leo', 'Lucas', 'Maya', 'Mateo', 'Mei', 'Miriam', 'Nadia', 'Nikolai', 'Noor', 'Olivia', 'Omar', 'Priya', 'Rafael',
  'Rosa', 'Samir', 'Sofia', 'Tariq', 'Tomas', 'Valentina', 'Wei', 'Yara', 'Yusuf', 'Zara', 'Zoe', 'Ethan', 'Grace', 'Hugo',
  'Iris', 'Jasper', 'Lena', 'Marcus', 'Nina', 'Oscar', 'Paula', 'Ravi', 'Sebastian', 'Talia', 'Victor', 'Wren', 'Ximena',
];
const LAST_NAMES = [
  'Abara', 'Alvarez', 'Anderson', 'Baptiste', 'Becker', 'Bergström', 'Bianchi', 'Brennan', 'Castillo', 'Chowdhury', 'Costa',
  'Dahl', 'Delgado', 'Dubois', 'Eriksen', 'Farouk', 'Fernandes', 'Fischer', 'Gallagher', 'García', 'Haddad', 'Hansen',
  'Hoffmann', 'Ibarra', 'Iyer', 'Jansen', 'Kaur', 'Kimura', 'Kowalski', 'Laurent', 'Lindqvist', 'Mahmoud', 'Marino',
  'Mendes', 'Mensah', 'Nakamura', 'Novak', 'Okafor', 'Olsen', 'Osei', 'Park', 'Petrov', 'Quinn', 'Ramírez', 'Rossi',
  'Salazar', 'Sato', 'Schneider', 'Silva', 'Singh', 'Sørensen', 'Tanaka', 'Torres', 'Varga', 'Vasquez', 'Walsh', 'Weber',
  'Yamamoto', 'Zhang', 'Zimmerman', 'Ahmed', 'Blackwood', 'Carvalho', 'Duarte', 'Ekwueme', 'Fontaine', 'Guerrero',
];

const EVIDENCE_SOURCES = [
  'Manager assessment', 'Peer review', 'Certification record', 'Project delivery review', 'Self-assessment',
  'Performance review 2025', 'Skills audit Q2 2026', 'Hiring panel assessment', 'Code review sample', 'Client feedback',
];

// New skills: [name, criticality, target proficiency, required holders]
const NEW_SKILLS = [
  ['Go', 3, 3, 3], ['Java', 3, 3, 4], ['Rust', 3, 3, 2], ['Swift & iOS', 3, 3, 2], ['Kotlin & Android', 3, 3, 2],
  ['GraphQL', 2, 3, 3], ['PostgreSQL', 4, 3, 5], ['Data Engineering', 4, 3, 4], ['Analytics Engineering (dbt)', 3, 3, 3],
  ['Apache Spark', 3, 3, 2], ['Statistics', 3, 3, 3], ['Experimentation & A/B Testing', 3, 3, 3], ['MLOps', 4, 3, 3],
  ['Prompt Engineering', 2, 3, 3], ['Observability', 4, 3, 4], ['Terraform', 4, 3, 4], ['AWS', 4, 3, 5], ['Azure', 3, 3, 3],
  ['Networking', 3, 3, 3], ['Identity & Access Management', 5, 3, 3], ['Threat Modelling', 4, 3, 2],
  ['Penetration Testing', 4, 4, 2], ['Vendor Risk Management', 4, 3, 2], ['Financial Modelling', 4, 3, 3],
  ['Revenue Recognition', 5, 4, 2], ['Payroll Administration', 5, 3, 2], ['Procurement', 3, 3, 2],
  ['Contract Negotiation', 3, 3, 3], ['Data Privacy (GDPR)', 5, 3, 3], ['Customer Onboarding', 3, 3, 5],
  ['Account Management', 3, 3, 6], ['Solution Selling', 3, 3, 5], ['Content Marketing', 2, 3, 3], ['SEO & Web Analytics', 2, 3, 2],
  ['Brand Design', 2, 3, 2], ['Design Systems', 3, 3, 3], ['Figma', 2, 3, 4], ['Technical Recruiting', 3, 3, 2],
  ['Coaching & Mentoring', 3, 3, 6], ['Change Management', 3, 3, 3], ['Agile Delivery', 3, 3, 8],
  ['Stakeholder Management', 3, 3, 6], ['Data Visualization', 3, 3, 4], ['Salesforce Administration', 4, 3, 2],
  ['ERP Administration', 4, 3, 2], ['Public Speaking', 1, 3, 3],
];

// Departments: head role, manager role, individual-contributor roles with weights, and the skill pool
// people in the department draw adjacent skills from. Roles listed here that the demo lacks are added.
const DEPARTMENTS = [
  { name: 'Engineering', size: 52, head: 'Director of Engineering', managers: ['Engineering Manager'],
    roles: [['Backend Engineer', 4], ['Frontend Engineer', 3], ['Staff Engineer', 1], ['Mobile Engineer', 2], ['QA Engineer', 2], ['Technical Writer', 1]],
    pool: ['React', 'TypeScript', 'Node.js', 'API Design', 'SQL & Data Modeling', 'Test Automation', 'GraphQL', 'PostgreSQL', 'Go', 'Java', 'Rust', 'Swift & iOS', 'Kotlin & Android', 'Observability', 'Agile Delivery', 'Accessibility'] },
  { name: 'Platform', size: 20, head: 'Head of Platform', managers: ['Engineering Manager'],
    roles: [['DevOps Engineer', 2], ['Cloud Engineer', 2], ['Site Reliability Engineer', 2], ['Platform Engineer', 3]],
    pool: ['DevOps', 'Kubernetes', 'Cloud Architecture', 'Terraform', 'AWS', 'Azure', 'Observability', 'Networking', 'Incident Response', 'Go', 'Python'] },
  { name: 'Data & AI', size: 24, head: 'Head of Data', managers: ['Engineering Manager'],
    roles: [['Data Engineer', 3], ['Data Analyst', 3], ['Data Scientist', 2], ['ML Engineer', 2], ['Analytics Engineer', 2]],
    pool: ['Python', 'SQL & Data Modeling', 'Data Analysis', 'Machine Learning', 'Data Engineering', 'Analytics Engineering (dbt)', 'Apache Spark', 'Statistics', 'Experimentation & A/B Testing', 'MLOps', 'Prompt Engineering', 'Data Visualization'] },
  { name: 'Product', size: 14, head: 'Head of Product', managers: ['Program Manager'],
    roles: [['Product Manager', 3], ['Business Analyst', 2]],
    pool: ['Project Management', 'Communication', 'Stakeholder Management', 'Experimentation & A/B Testing', 'Data Analysis', 'Agile Delivery', 'UX Research', 'Public Speaking'] },
  { name: 'Design', size: 12, head: 'Design Lead', managers: [],
    roles: [['UX Designer', 3], ['Product Designer', 3]],
    pool: ['UX Research', 'Accessibility', 'Figma', 'Design Systems', 'Brand Design', 'Communication'] },
  { name: 'Security', size: 12, head: 'Head of Security', managers: [],
    roles: [['Security Analyst', 2], ['Security Engineer', 3]],
    pool: ['Identity & Access Management', 'Threat Modelling', 'Penetration Testing', 'Incident Response', 'Networking', 'Vendor Risk Management', 'Data Privacy (GDPR)', 'Cloud Architecture'] },
  { name: 'Finance Operations', size: 16, head: 'Head of Finance', managers: ['Finance Manager'],
    roles: [['Finance Analyst', 3], ['Accountant', 2], ['Payroll Specialist', 1], ['Billing Operations Specialist', 2]],
    pool: ['Financial Modelling', 'Revenue Recognition', 'Payroll Administration', 'ERP Administration', 'SQL & Data Modeling', 'Data Visualization', 'Procurement'] },
  { name: 'Risk & Compliance', size: 8, head: 'Head of Compliance', managers: [],
    roles: [['Compliance Analyst', 2], ['Legal Counsel', 1]],
    pool: ['Data Privacy (GDPR)', 'Vendor Risk Management', 'Contract Negotiation', 'Change Management', 'Communication'] },
  { name: 'Operations', size: 14, head: 'Head of Operations', managers: ['Operations Manager'],
    roles: [['Program Manager', 2], ['Procurement Specialist', 1], ['IT Support Specialist', 2]],
    pool: ['Project Management', 'Procurement', 'Change Management', 'Networking', 'ERP Administration', 'Stakeholder Management', 'Agile Delivery'] },
  { name: 'Customer Success', size: 22, head: 'Head of Customer Success', managers: ['Customer Success Manager'],
    roles: [['Support Engineer', 3], ['Customer Success Specialist', 3], ['Solutions Architect', 1]],
    pool: ['Customer Onboarding', 'Account Management', 'Communication', 'Salesforce Administration', 'API Design', 'Public Speaking'] },
  { name: 'Sales', size: 20, head: 'Head of Sales', managers: ['Sales Manager'],
    roles: [['Account Executive', 4], ['Sales Engineer', 2], ['Sales Development Representative', 2]],
    pool: ['Solution Selling', 'Account Management', 'Contract Negotiation', 'Salesforce Administration', 'Public Speaking', 'Communication'] },
  { name: 'Marketing', size: 12, head: 'Head of Marketing', managers: ['Marketing Manager'],
    roles: [['Content Strategist', 2], ['Growth Marketer', 2], ['Marketing Analyst', 1]],
    pool: ['Content Marketing', 'SEO & Web Analytics', 'Brand Design', 'Data Visualization', 'Experimentation & A/B Testing', 'Public Speaking'] },
  { name: 'People', size: 10, head: 'Head of People', managers: [],
    roles: [['People Partner', 2], ['Recruiter', 2], ['Learning & Development Specialist', 1]],
    pool: ['Technical Recruiting', 'Coaching & Mentoring', 'Change Management', 'Communication', 'Payroll Administration', 'Data Privacy (GDPR)'] },
];

// Requirements for roles the demo does not define: [skill, minimum proficiency]. Heads and managers
// all need Leadership and Communication; individual contributors get their craft skills.
const NEW_ROLE_REQUIREMENTS = {
  'Director of Engineering': [['Leadership', 4], ['Communication', 4], ['Stakeholder Management', 4], ['Agile Delivery', 3], ['API Design', 3]],
  'Head of Platform': [['Leadership', 4], ['Communication', 4], ['Cloud Architecture', 4], ['Incident Response', 3]],
  'Head of Data': [['Leadership', 4], ['Communication', 4], ['Data Engineering', 3], ['Statistics', 3]],
  'Head of Product': [['Leadership', 4], ['Communication', 4], ['Stakeholder Management', 4], ['Project Management', 3]],
  'Design Lead': [['Leadership', 3], ['Communication', 4], ['Design Systems', 4], ['UX Research', 3]],
  'Head of Security': [['Leadership', 4], ['Communication', 4], ['Threat Modelling', 4], ['Identity & Access Management', 3]],
  'Head of Finance': [['Leadership', 4], ['Communication', 4], ['Financial Modelling', 4], ['Revenue Recognition', 3]],
  'Head of Compliance': [['Leadership', 4], ['Communication', 4], ['Data Privacy (GDPR)', 4], ['Vendor Risk Management', 3]],
  'Head of Operations': [['Leadership', 4], ['Communication', 4], ['Change Management', 4], ['Procurement', 3]],
  'Head of Customer Success': [['Leadership', 4], ['Communication', 4], ['Account Management', 4], ['Customer Onboarding', 3]],
  'Head of Sales': [['Leadership', 4], ['Communication', 4], ['Solution Selling', 4], ['Contract Negotiation', 3]],
  'Head of Marketing': [['Leadership', 4], ['Communication', 4], ['Content Marketing', 4], ['SEO & Web Analytics', 3]],
  'Head of People': [['Leadership', 4], ['Communication', 4], ['Coaching & Mentoring', 4], ['Change Management', 3]],
  'Finance Manager': [['Leadership', 3], ['Communication', 3], ['Financial Modelling', 3], ['ERP Administration', 3]],
  'Operations Manager': [['Leadership', 3], ['Communication', 3], ['Project Management', 3], ['Change Management', 3]],
  'Customer Success Manager': [['Leadership', 3], ['Communication', 3], ['Account Management', 3], ['Customer Onboarding', 3]],
  'Sales Manager': [['Leadership', 3], ['Communication', 3], ['Solution Selling', 3], ['Salesforce Administration', 2]],
  'Marketing Manager': [['Leadership', 3], ['Communication', 3], ['Content Marketing', 3], ['SEO & Web Analytics', 2]],
  'Staff Engineer': [['API Design', 4], ['TypeScript', 4], ['Node.js', 4], ['PostgreSQL', 3], ['Observability', 3], ['Coaching & Mentoring', 3]],
  'Mobile Engineer': [['Swift & iOS', 3], ['Kotlin & Android', 3], ['API Design', 2], ['Test Automation', 2]],
  'Platform Engineer': [['Kubernetes', 3], ['Terraform', 3], ['AWS', 3], ['Observability', 3], ['Go', 2]],
  'Data Engineer': [['Data Engineering', 3], ['SQL & Data Modeling', 3], ['Python', 3], ['Apache Spark', 2], ['AWS', 2]],
  'ML Engineer': [['Machine Learning', 3], ['MLOps', 3], ['Python', 3], ['Statistics', 2]],
  'Analytics Engineer': [['Analytics Engineering (dbt)', 3], ['SQL & Data Modeling', 3], ['Data Visualization', 3]],
  'Product Designer': [['Figma', 3], ['Design Systems', 3], ['UX Research', 2], ['Accessibility', 2]],
  'Security Engineer': [['Identity & Access Management', 3], ['Threat Modelling', 3], ['Networking', 3], ['Penetration Testing', 2]],
  'Finance Analyst': [['Financial Modelling', 3], ['SQL & Data Modeling', 2], ['Data Visualization', 2]],
  Accountant: [['Revenue Recognition', 3], ['ERP Administration', 3], ['Financial Modelling', 2]],
  'Payroll Specialist': [['Payroll Administration', 3], ['ERP Administration', 2], ['Data Privacy (GDPR)', 2]],
  'Legal Counsel': [['Contract Negotiation', 4], ['Data Privacy (GDPR)', 3], ['Vendor Risk Management', 3]],
  'Procurement Specialist': [['Procurement', 3], ['Contract Negotiation', 3], ['ERP Administration', 2]],
  'IT Support Specialist': [['Networking', 3], ['Identity & Access Management', 2], ['Communication', 2]],
  'Customer Success Specialist': [['Customer Onboarding', 3], ['Account Management', 3], ['Communication', 3]],
  'Account Executive': [['Solution Selling', 3], ['Contract Negotiation', 2], ['Salesforce Administration', 2], ['Communication', 3]],
  'Sales Engineer': [['Solution Selling', 3], ['API Design', 2], ['Public Speaking', 3]],
  'Sales Development Representative': [['Solution Selling', 2], ['Salesforce Administration', 2], ['Communication', 3]],
  'Content Strategist': [['Content Marketing', 3], ['SEO & Web Analytics', 2], ['Communication', 3]],
  'Growth Marketer': [['Experimentation & A/B Testing', 3], ['SEO & Web Analytics', 3], ['Data Visualization', 2]],
  'Marketing Analyst': [['Data Analysis', 3], ['SEO & Web Analytics', 3], ['Data Visualization', 3]],
  Recruiter: [['Technical Recruiting', 3], ['Communication', 3], ['Stakeholder Management', 2]],
  'Learning & Development Specialist': [['Coaching & Mentoring', 3], ['Change Management', 3], ['Public Speaking', 3]],
};
const NEW_ROLE_CRITICALITY = { 'Director of Engineering': 5, 'Head of Platform': 5, 'Head of Data': 4, 'Head of Product': 4, 'Design Lead': 3, 'Head of Security': 5,
  'Head of Finance': 5, 'Head of Compliance': 5, 'Head of Operations': 4, 'Head of Customer Success': 4, 'Head of Sales': 4, 'Head of Marketing': 3, 'Head of People': 4,
  'Finance Manager': 4, 'Operations Manager': 3, 'Customer Success Manager': 3, 'Sales Manager': 3, 'Marketing Manager': 3, 'Staff Engineer': 4, 'Mobile Engineer': 3,
  'Platform Engineer': 4, 'Data Engineer': 4, 'ML Engineer': 3, 'Analytics Engineer': 3, 'Product Designer': 3, 'Security Engineer': 5, 'Finance Analyst': 3,
  Accountant: 4, 'Payroll Specialist': 5, 'Legal Counsel': 4, 'Procurement Specialist': 3, 'IT Support Specialist': 2, 'Customer Success Specialist': 3,
  'Account Executive': 3, 'Sales Engineer': 3, 'Sales Development Representative': 2, 'Content Strategist': 2, 'Growth Marketer': 3, 'Marketing Analyst': 3,
  Recruiter: 3, 'Learning & Development Specialist': 3 };

// [slug, title, kind, skills, verified, provider]
const NEW_RESOURCES = [
  ['course-go-services', 'Building Services in Go', 'training', 'Go;API Design', true, 'Engineering Guild (internal)'],
  ['course-rust-foundations', 'Rust Foundations', 'training', 'Rust', false, null],
  ['cert-aws-architect', 'Cloud Architect Certification (AWS track)', 'certification', 'AWS;Cloud Architecture', true, 'Platform Guild (internal)'],
  ['cert-azure-admin', 'Azure Administrator Certificate', 'certification', 'Azure', true, 'Platform Guild (internal)'],
  ['course-terraform-iac', 'Infrastructure as Code with Terraform', 'training', 'Terraform;DevOps', true, 'Platform Guild (internal)'],
  ['course-observability', 'Observability Practices Workshop', 'training', 'Observability;Incident Response', true, 'Site Reliability Chapter (internal)'],
  ['rotation-sre-shadow', 'SRE On-call Shadowing Rotation', 'job_rotation', 'Incident Response;Observability;Kubernetes', true, 'Site Reliability Chapter (internal)'],
  ['course-data-engineering', 'Data Engineering Fundamentals', 'training', 'Data Engineering;Apache Spark;SQL & Data Modeling', true, 'Data Guild (internal)'],
  ['course-dbt-analytics', 'Analytics Engineering with dbt', 'training', 'Analytics Engineering (dbt);SQL & Data Modeling', true, 'Data Guild (internal)'],
  ['course-mlops', 'MLOps: From Notebook to Production', 'training', 'MLOps;Machine Learning', true, 'Data Guild (internal)'],
  ['course-experimentation', 'Experimentation and Causal Inference', 'training', 'Experimentation & A/B Testing;Statistics', false, null],
  ['course-prompting', 'Prompt Engineering for Product Teams', 'training', 'Prompt Engineering', false, null],
  ['cert-iam-practitioner', 'Identity and Access Management Practitioner', 'certification', 'Identity & Access Management', true, 'Security Office (internal)'],
  ['course-threat-modelling', 'Threat Modelling Workshop', 'training', 'Threat Modelling;Penetration Testing', true, 'Security Office (internal)'],
  ['cert-privacy-gdpr', 'Data Privacy Practitioner (GDPR)', 'certification', 'Data Privacy (GDPR)', true, 'Compliance Office (internal)'],
  ['course-vendor-risk', 'Vendor Risk Management Essentials', 'training', 'Vendor Risk Management;Procurement', true, 'Compliance Office (internal)'],
  ['course-financial-modelling', 'Financial Modelling Bootcamp', 'training', 'Financial Modelling', true, 'Finance Academy (internal)'],
  ['cert-revenue-recognition', 'Revenue Recognition Certificate', 'certification', 'Revenue Recognition', true, 'Finance Academy (internal)'],
  ['doc-payroll-runbook', 'Payroll Close Runbook', 'documentation', 'Payroll Administration;ERP Administration', true, 'Finance Academy (internal)'],
  ['mentoring-account-management', 'Account Management Mentoring Circle', 'mentoring', 'Account Management;Customer Onboarding', true, 'Customer Success Chapter (internal)'],
  ['course-solution-selling', 'Solution Selling Programme', 'training', 'Solution Selling;Contract Negotiation', true, 'Sales Enablement (internal)'],
  ['cert-salesforce-admin', 'Salesforce Administrator Certificate', 'certification', 'Salesforce Administration', true, 'Sales Enablement (internal)'],
  ['course-design-systems', 'Design Systems in Practice', 'training', 'Design Systems;Figma', true, 'Design Chapter (internal)'],
  ['course-content-seo', 'Content and SEO Fundamentals', 'training', 'Content Marketing;SEO & Web Analytics', false, null],
  ['mentoring-coaching', 'Coaching Skills for Managers', 'mentoring', 'Coaching & Mentoring;Leadership', true, 'People Team (internal)'],
  ['course-change-management', 'Leading Change', 'training', 'Change Management;Stakeholder Management', true, 'People Team (internal)'],
  ['course-public-speaking', 'Presenting with Confidence', 'training', 'Public Speaking;Communication', true, 'People Team (internal)'],
  ['project-mobile-release', 'Mobile Release Train Project', 'project_experience', 'Swift & iOS;Kotlin & Android;Test Automation', true, 'Engineering Guild (internal)'],
];

// [skill, required holders, target proficiency, criticality, effective month, status]
const NEW_FUTURE_REQUIREMENTS = [
  ['Data Privacy (GDPR)', 5, 3, 5, 3, 'reviewed'],
  ['MLOps', 4, 3, 4, 6, 'reviewed'],
  ['Observability', 6, 3, 4, 6, 'reviewed'],
  ['Terraform', 6, 3, 4, 9, 'reviewed'],
  ['Prompt Engineering', 6, 3, 3, 9, 'proposed'],
  ['Rust', 3, 3, 3, 12, 'proposed'],
  ['Identity & Access Management', 4, 4, 5, 6, 'reviewed'],
  ['Revenue Recognition', 3, 4, 5, 12, 'proposed'],
  ['Salesforce Administration', 3, 3, 4, 4, 'reviewed'],
  ['Kotlin & Android', 3, 3, 3, 12, 'proposed'],
];

// Additional sign-in accounts so each role can be demonstrated with more than one person.
// [email, display name, role, employee name or a placeholder resolved after generation]
const EXTRA_USERS = [
  ['director.engineering@keystone.demo', null, 'manager', { head: 'Engineering' }],
  ['head.finance@keystone.demo', null, 'manager', { head: 'Finance Operations' }],
  ['head.sales@keystone.demo', null, 'manager', { head: 'Sales' }],
  ['people.partner@keystone.demo', null, 'hr', { role: 'People Partner', department: 'People' }],
  ['data.engineer@keystone.demo', null, 'employee', { role: 'Data Engineer', department: 'Data & AI' }],
  ['account.executive@keystone.demo', null, 'employee', { role: 'Account Executive', department: 'Sales' }],
  ['ops.admin@keystone.demo', 'Operations Administrator', 'admin', null],
];

// ---- helpers ----
const csvField = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const writeCsv = (file, columns, rows) => {
  const lines = [columns.join(','), ...rows.map((row) => columns.map((column) => csvField(row[column])).join(','))];
  fs.writeFileSync(path.join(OUT_DIR, file), `${lines.join('\r\n')}\r\n`, 'utf8');
  return rows.length;
};
const isoDate = (date) => date.toISOString().slice(0, 10);
const daysAgo = (days) => isoDate(new Date(TODAY.getTime() - days * 86400000));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Verification dates are skewed towards recent, with a deliberate stale and unverified tail.
function verificationDate() {
  const roll = random.next();
  if (roll < 0.14) return '';                         // never verified: unknown, not zero
  if (roll < 0.30) return daysAgo(random.int(560, 1100)); // verified long ago: stale under any sensible setting
  return daysAgo(random.int(7, 540));
}

function main() {
  const demo = {
    roles: readCsvTable(path.join(DEMO_DIR, 'roles.csv'), ['role', 'criticality', 'source']),
    skills: readCsvTable(path.join(DEMO_DIR, 'skills.csv'), ['name', 'criticality', 'target_proficiency', 'required_holders', 'demand_target', 'source']),
    employees: readCsvTable(path.join(DEMO_DIR, 'employees.csv'), ['name', 'role', 'department', 'mentoring_hours_per_month', 'manager']),
    roleRequirements: readCsvTable(path.join(DEMO_DIR, 'role_requirements.csv'), ['role', 'skill', 'minimum_proficiency']),
    employeeSkills: readCsvTable(path.join(DEMO_DIR, 'employee_skills.csv'), ['employee', 'skill', 'proficiency', 'evidence_source', 'last_verified_at']),
    resources: readCsvTable(path.join(DEMO_DIR, 'learning_resources.csv'), ['slug', 'title', 'kind', 'skills', 'verified', 'url', 'provenance', 'provider']),
    futureRequirements: readCsvTable(path.join(DEMO_DIR, 'future_requirements.csv'), ['skill', 'required_holders', 'target_proficiency', 'criticality', 'effective_month', 'status', 'provenance']),
    users: readCsvTable(path.join(DEMO_DIR, 'users.csv'), ['email', 'display_name', 'role', 'employee']),
  };
  const strip = (row) => { const { at: _at, ...rest } = row; return rest; };

  // Skills and roles: demo first, then the additions.
  const skills = demo.skills.map(strip);
  const skillNames = new Set(skills.map((skill) => skill.name));
  for (const [name, criticality, target, holders] of NEW_SKILLS) {
    if (skillNames.has(name)) throw new Error(`skill "${name}" already exists in the demo set`);
    skillNames.add(name);
    skills.push({ name, criticality, target_proficiency: target, required_holders: holders, demand_target: '', source: PROVENANCE });
  }
  const roles = demo.roles.map(strip);
  const roleNames = new Set(roles.map((role) => role.name ?? role.role));
  const roleRequirements = demo.roleRequirements.map(strip);
  const requirementsByRole = new Map();
  for (const requirement of roleRequirements) {
    if (!requirementsByRole.has(requirement.role)) requirementsByRole.set(requirement.role, []);
    requirementsByRole.get(requirement.role).push([requirement.skill, Number(requirement.minimum_proficiency)]);
  }
  for (const [role, requirements] of Object.entries(NEW_ROLE_REQUIREMENTS)) {
    if (roleNames.has(role)) throw new Error(`role "${role}" already exists in the demo set`);
    roleNames.add(role);
    roles.push({ role, criticality: NEW_ROLE_CRITICALITY[role], source: PROVENANCE });
    requirementsByRole.set(role, requirements);
    for (const [skill, minimum] of requirements) {
      if (!skillNames.has(skill)) throw new Error(`role "${role}" requires unknown skill "${skill}"`);
      roleRequirements.push({ role, skill, minimum_proficiency: minimum });
    }
  }
  for (const department of DEPARTMENTS) {
    for (const name of [department.head, ...department.managers, ...department.roles.map(([role]) => role)]) {
      if (!roleNames.has(name)) throw new Error(`department ${department.name} uses undefined role "${name}"`);
    }
    for (const skill of department.pool) if (!skillNames.has(skill)) throw new Error(`department ${department.name} pool has unknown skill "${skill}"`);
  }

  // People: demo rows verbatim (no start date recorded, exactly as the demo has it), then generated
  // departments with a head, a layer of managers and individual contributors.
  const employees = demo.employees.map((row) => ({ ...strip(row), start_date: '' }));
  const usedNames = new Set(employees.map((employee) => employee.name));
  const uniqueName = () => {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const name = `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`;
      if (!usedNames.has(name)) { usedNames.add(name); return name; }
    }
    throw new Error('ran out of unique names');
  };
  const startDate = (seniority) => daysAgo(random.int(seniority === 'head' ? 900 : seniority === 'manager' ? 400 : 30, seniority === 'head' ? 4000 : 3000));
  const generated = [];
  const headOf = new Map();
  const byRoleAndDepartment = new Map();
  const remember = (employee) => {
    generated.push(employee);
    employees.push(employee);
    const key = `${employee.role}|${employee.department}`;
    if (!byRoleAndDepartment.has(key)) byRoleAndDepartment.set(key, []);
    byRoleAndDepartment.get(key).push(employee);
  };
  for (const department of DEPARTMENTS) {
    const head = { name: uniqueName(), role: department.head, department: department.name, mentoring_hours_per_month: random.int(2, 8), manager: 'EXTERNAL', start_date: startDate('head') };
    remember(head);
    headOf.set(department.name, head);
    const managerCount = department.managers.length === 0 ? 0 : Math.max(1, Math.round(department.size / 9));
    const managers = [];
    for (let index = 0; index < managerCount; index += 1) {
      const manager = { name: uniqueName(), role: random.pick(department.managers), department: department.name, mentoring_hours_per_month: random.int(2, 6), manager: head.name, start_date: startDate('manager') };
      remember(manager);
      managers.push(manager);
    }
    const weighted = department.roles.flatMap(([role, weight]) => Array.from({ length: weight }, () => role));
    const contributors = department.size - 1 - managerCount;
    for (let index = 0; index < contributors; index += 1) {
      const leader = managers.length > 0 ? managers[index % managers.length] : head;
      const hours = random.chance(0.35) ? '' : random.int(0, 6); // blank = never recorded
      remember({ name: uniqueName(), role: random.pick(weighted), department: department.name, mentoring_hours_per_month: hours, manager: leader.name, start_date: startDate('ic') });
    }
  }

  // Evidence: every requirement of the person's role at roughly the required level, plus a few
  // adjacent skills from the department pool. Story skills are never generated.
  const employeeSkills = demo.employeeSkills.map(strip);
  const pairs = new Set(employeeSkills.map((edge) => `${edge.employee}|${edge.skill}`));
  const addEvidence = (employee, skill, proficiency) => {
    if (STORY_SKILLS.has(skill) || pairs.has(`${employee.name}|${skill}`)) return;
    pairs.add(`${employee.name}|${skill}`);
    employeeSkills.push({ employee: employee.name, skill, proficiency: clamp(proficiency, 1, 5), evidence_source: random.pick(EVIDENCE_SOURCES), last_verified_at: verificationDate() });
  };
  for (const employee of generated) {
    const department = DEPARTMENTS.find((entry) => entry.name === employee.department);
    for (const [skill, minimum] of requirementsByRole.get(employee.role) ?? []) {
      // Most people meet their role's bar; a visible minority sit one level under it.
      const offset = random.chance(0.22) ? -1 : random.chance(0.35) ? 1 : 0;
      if (random.chance(0.08)) continue; // a missing record stays missing: that is a data-quality finding, not a zero
      addEvidence(employee, skill, minimum + offset);
    }
    for (const skill of random.shuffle(department.pool).slice(0, random.int(1, 3))) addEvidence(employee, skill, random.int(1, 4));
  }

  // Catalogue and plan.
  const resources = demo.resources.map(strip);
  for (const [slug, title, kind, skillList, verified, provider] of NEW_RESOURCES) {
    for (const name of skillList.split(';')) if (!skillNames.has(name)) throw new Error(`resource ${slug} serves unknown skill "${name}"`);
    resources.push({ slug, title, kind, skills: skillList, verified: String(verified), url: '', provenance: PROVENANCE, provider: provider ?? '' });
  }
  const futureRequirements = demo.futureRequirements.map(strip);
  for (const [skill, holders, target, criticality, month, status] of NEW_FUTURE_REQUIREMENTS) {
    if (!skillNames.has(skill)) throw new Error(`future requirement for unknown skill "${skill}"`);
    futureRequirements.push({ skill, required_holders: holders, target_proficiency: target, criticality, effective_month: month, status, provenance: PROVENANCE });
  }

  // Accounts: the four demo accounts unchanged, plus one per extra persona.
  const users = demo.users.map(strip);
  const linked = new Set(users.map((user) => user.employee).filter(Boolean));
  for (const [email, displayName, role, selector] of EXTRA_USERS) {
    let employee = null;
    if (selector?.head) employee = headOf.get(selector.head);
    else if (selector) employee = (byRoleAndDepartment.get(`${selector.role}|${selector.department}`) ?? []).find((candidate) => !linked.has(candidate.name));
    if (selector && !employee) throw new Error(`no employee found for account ${email}`);
    if (employee) linked.add(employee.name);
    users.push({ email, display_name: displayName ?? employee.name, role, employee: employee?.name ?? '' });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const counts = {
    roles: writeCsv('roles.csv', ['role', 'criticality', 'source'], roles),
    skills: writeCsv('skills.csv', ['name', 'criticality', 'target_proficiency', 'required_holders', 'demand_target', 'source'], skills),
    employees: writeCsv('employees.csv', ['name', 'role', 'department', 'mentoring_hours_per_month', 'manager', 'start_date'], employees),
    role_requirements: writeCsv('role_requirements.csv', ['role', 'skill', 'minimum_proficiency'], roleRequirements),
    employee_skills: writeCsv('employee_skills.csv', ['employee', 'skill', 'proficiency', 'evidence_source', 'last_verified_at'], employeeSkills),
    learning_resources: writeCsv('learning_resources.csv', ['slug', 'title', 'kind', 'skills', 'verified', 'url', 'provenance', 'provider'], resources),
    future_requirements: writeCsv('future_requirements.csv', ['skill', 'required_holders', 'target_proficiency', 'criticality', 'effective_month', 'status', 'provenance'], futureRequirements),
    users: writeCsv('users.csv', ['email', 'display_name', 'role', 'employee'], users),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), [
    '# Enterprise dataset (generated, fictional)',
    '',
    'Produced by `node scripts/generate-enterprise-dataset.js` from `backend/data/demo/` plus generated departments.',
    'Every person, skill, course and account is fictional. Regenerating with the same script gives identical files.',
    '',
    `Seed a fresh database with it: stop the backend, then \`npm run seed:enterprise\` (or set \`KEYSTONE_SEED_DIR\` to this folder).`,
    '',
    '| File | Rows |', '|---|---|',
    ...Object.entries(counts).map(([file, rows]) => `| ${file}.csv | ${rows} |`),
    '',
    'The demo story is preserved: generated people never hold Legacy Billing Recovery, Payments Compliance, Cybersecurity or AI Governance,',
    'so those skills keep the same qualified holders as the demo. Extra sign-in accounts use the same demo password as the four demo accounts:',
    '',
    ...users.filter((user) => !demo.users.some((row) => row.email === user.email)).map((user) => `- \`${user.email}\` — ${user.role}${user.employee ? ` (${user.employee})` : ''}`),
    '',
  ].join('\n'), 'utf8');
  console.log(`Wrote ${OUT_DIR}:`, counts);
}

main();
