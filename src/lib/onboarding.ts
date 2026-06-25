// v1.6 — first-run onboarding flag.
//
// NCC's Life Profile store always holds a value (defaults to the Student
// preset), so there's no natural "null profile" to detect first run. We gate
// the onboarding wizard on an explicit localStorage flag instead, treating two
// signals as "already set up":
//   - `ncc.onboarded`  — the wizard was completed or skipped
//   - `ncc.lifeProfile` — a profile was saved before v1.6 (returning user who
//                          predates onboarding shouldn't be re-prompted)
//
// Local-only flag (matches the app's other client flags). Cloud life_profile
// presence is also honoured by the gate caller via the loaded store.

const ONBOARDED_KEY = 'ncc.onboarded';
const PROFILE_KEY = 'ncc.lifeProfile';

export function isOnboarded(): boolean {
  try {
    return (
      localStorage.getItem(ONBOARDED_KEY) === '1' ||
      localStorage.getItem(PROFILE_KEY) != null
    );
  } catch {
    return false;
  }
}

export function setOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* best-effort flag */
  }
}
