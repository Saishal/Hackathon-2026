// Stable v1 snapshot for teammates who need the contract shape without a database.
// Mirrors the Legacy Billing Recovery demo story: one expert, one learner, no backup.
// createWorkforceFixture() returns a fresh deep copy each call, so a test that asserts
// a baseline was not mutated cannot be undermined by a shared reference.
const WORKFORCE_FIXTURE = {
  schemaVersion: 1,
  // Liam has recorded mentoring capacity; the other two are omitted deliberately,
  // which consumers read as unknown rather than zero.
  employees: [
    { id: 1, name: 'Liam Chen', role: 'Backend Engineer', department: 'Engineering', managerId: null, mentoringHoursPerMonth: 4 },
    { id: 2, name: 'Mason Green', role: 'Backend Engineer', department: 'Engineering', managerId: 1 },
    { id: 3, name: 'Ava Patel', role: 'Frontend Engineer', department: 'Engineering', managerId: null },
  ],
  skills: [
    {
      id: 1,
      name: 'Legacy Billing Recovery',
      criticality: 5,
      targetProficiency: 3,
      requiredHolders: 2,
      demandTarget: null,
      metadataSource: 'fictional demo default',
    },
    {
      id: 2,
      name: 'React',
      criticality: 3,
      targetProficiency: 3,
      requiredHolders: 2,
      demandTarget: 4,
      metadataSource: 'fictional demo default',
    },
  ],
  roles: [
    {
      id: 1,
      name: 'Backend Engineer',
      criticality: 3,
      metadataSource: 'fictional demo default',
      incumbentIds: [1, 2],
      requirements: [{ skillId: 1, minimumProficiency: 3 }],
    },
    {
      id: 2,
      name: 'Frontend Engineer',
      criticality: 3,
      metadataSource: 'fictional demo default',
      incumbentIds: [3],
      requirements: [{ skillId: 2, minimumProficiency: 3 }],
    },
  ],
  learningResources: [
    {
      id: 'train-billing-internal',
      title: 'Internal billing systems walkthrough (fictional)',
      category: 'training',
      verified: true,
      url: null,
      provider: 'Fictional internal academy',
      provenance: 'fictional demo entry',
      skillIds: [1],
    },
  ],
  futureRequirements: [
    {
      id: 1,
      skillId: 1,
      skillName: 'Legacy Billing Recovery',
      requiredHolders: 3,
      targetProficiency: 3,
      criticality: 5,
      effectiveMonth: 12,
      status: 'proposed',
      provenance: 'fictional demo entry',
    },
  ],
  matrix: [
    { employeeId: 1, skillId: 1, proficiency: 5, evidenceSource: 'fictional seed', lastVerifiedAt: null },
    { employeeId: 2, skillId: 1, proficiency: 2, evidenceSource: 'fictional seed', lastVerifiedAt: null },
    { employeeId: 3, skillId: 2, proficiency: 5, evidenceSource: 'fictional seed', lastVerifiedAt: null },
  ],
};

function createWorkforceFixture() {
  return structuredClone(WORKFORCE_FIXTURE);
}

module.exports = { createWorkforceFixture };
