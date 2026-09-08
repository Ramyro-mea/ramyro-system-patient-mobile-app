import {
  buildSharedStudyUrl,
  countBy,
  filterStudies,
  isReportAvailable,
} from '@/src/lib/studies';
import type { PatientWorklistItem } from '@/src/types/api';

function study(overrides: Partial<PatientWorklistItem> = {}): PatientWorklistItem {
  return {
    tenantId: null,
    patientID: 'P-1',
    studyID: 1,
    studyInstanceUID: '1.2.3',
    studyDate: '20260101',
    studyTime: '120000',
    studyDescription: 'Chest',
    statusId: 1,
    studyStatus: 'Completed',
    reportStatusId: 1,
    reportStatus: null,
    reportDoubleVerfication: null,
    reportReview: false,
    reportVerificationType: null,
    seriesCount: 2,
    bodyPartExamined: 'CHEST',
    modality: 'CT',
    ...overrides,
  };
}

describe('study behavior', () => {
  it('matches the exact reviewed and verified report rules', () => {
    expect(isReportAvailable(study({ reportReview: true, reportStatus: 'Reviewed' }))).toBe(true);
    expect(isReportAvailable(study({ reportVerificationType: 2, reportStatus: 'Verified' }))).toBe(true);
    expect(isReportAvailable(study({ reportReview: true, reportStatus: 'Verified' }))).toBe(false);
    expect(isReportAvailable(study({ reportVerificationType: 1, reportStatus: 'Verified' }))).toBe(false);
  });

  it('counts and filters modality/status values', () => {
    const studies = [
      study({ studyID: 1, modality: 'CT', reportStatus: 'Verified' }),
      study({ studyID: 2, modality: 'MR', reportStatus: 'Reviewed' }),
      study({ studyID: 3, modality: 'CT', reportStatus: 'Reviewed' }),
    ];
    expect(countBy(studies, (item) => item.modality)).toEqual({ CT: 2, MR: 1 });
    expect(filterStudies(studies, { modality: 'CT', status: 'Reviewed' }).map((item) => item.studyID)).toEqual([3]);
  });

  it('URL-encodes the shared-study code', () => {
    expect(buildSharedStudyUrl('code + / ?')).toContain('code=code+%2B+%2F+%3F');
  });
});
