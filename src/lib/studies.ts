import type { PatientWorklistItem } from '@/src/types/api';
import { env } from '@/src/config/env';

export interface StudyFilters {
  modality: string | null;
  status: string | null;
}

export function isReportAvailable(study: PatientWorklistItem): boolean {
  const reviewed =
    study.reportReview === true && study.reportStatus === 'Reviewed';
  const verified =
    study.reportVerificationType === 2 &&
    study.reportStatus === 'Verified';
  return reviewed || verified;
}

export function countBy(
  studies: PatientWorklistItem[],
  selector: (study: PatientWorklistItem) => string | null,
): Record<string, number> {
  return studies.reduce<Record<string, number>>((counts, study) => {
    const value = selector(study) || 'Unknown';
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

export function filterStudies(
  studies: PatientWorklistItem[],
  filters: StudyFilters,
): PatientWorklistItem[] {
  return studies.filter(
    (study) =>
      (!filters.modality || study.modality === filters.modality) &&
      (!filters.status || study.reportStatus === filters.status),
  );
}

export function buildSharedStudyUrl(code: string): string {
  const url = new URL(env.sharedStudyUrl);
  url.searchParams.set('code', code);
  return url.toString();
}
