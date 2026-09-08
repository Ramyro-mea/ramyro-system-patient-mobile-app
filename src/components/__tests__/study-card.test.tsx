import { fireEvent, render } from '@testing-library/react-native';

import { StudyCard } from '@/src/components/portal/study-card';
import { lightColors as mockLightColors } from '@/src/theme/colors';
import type { PatientWorklistItem } from '@/src/types/api';

jest.mock('@/src/providers/theme-provider', () => ({
  useAppTheme: () => ({ mode: 'light', colors: mockLightColors, toggleTheme: jest.fn() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const baseStudy: PatientWorklistItem = {
  tenantId: null,
  patientID: 'P1',
  studyID: 44,
  studyInstanceUID: null,
  studyDate: '2026-01-01',
  studyTime: '12:00',
  studyDescription: 'Chest CT',
  statusId: 1,
  studyStatus: 'Completed',
  reportStatusId: null,
  reportStatus: 'Draft',
  reportDoubleVerfication: null,
  reportReview: false,
  reportVerificationType: null,
  seriesCount: 3,
  bodyPartExamined: 'CHEST',
  modality: 'CT',
};

describe('StudyCard actions', () => {
  it('disables report, viewer, and share when the requirements are absent', () => {
    const screen = render(<StudyCard study={baseStudy} onReport={jest.fn()} onViewer={jest.fn()} onShare={jest.fn()} />);
    expect(screen.getByLabelText('Report').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Viewer').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Share').props.accessibilityState.disabled).toBe(true);
  });

  it('enables reviewed reports and a viewer with a UID', () => {
    const onReport = jest.fn();
    const study = { ...baseStudy, reportReview: true, reportStatus: 'Reviewed', studyInstanceUID: '1.2.3' };
    const screen = render(<StudyCard study={study} onReport={onReport} onViewer={jest.fn()} onShare={jest.fn()} />);
    expect(screen.getByLabelText('Report').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByLabelText('Viewer').props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByLabelText('Report'));
    expect(onReport).toHaveBeenCalledTimes(1);
  });
});
