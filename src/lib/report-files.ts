import { Directory, File, Paths } from 'expo-file-system';

const reportDirectory = () => new Directory(Paths.cache, 'patient-reports');

export function createReportFile(studyId: number, bytes: Uint8Array): File {
  const directory = reportDirectory();
  directory.create({ idempotent: true, intermediates: true });

  const file = new File(directory, `patient-report-study-${studyId}.pdf`);
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);
  return file;
}

export function clearReportCache(): void {
  try {
    const directory = reportDirectory();
    if (directory.exists) directory.delete();
  } catch {
    // Cache cleanup is best-effort and must never block logout.
  }
}

export function deleteReport(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The operating system may already have reclaimed the cache file.
  }
}

