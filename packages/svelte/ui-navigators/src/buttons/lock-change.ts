import { t } from "@tutors/i18n";
import type { LockChangeResult } from "@tutors/rbac";
import { toaster } from "@tutors/ui-primitives/utils/toaster";

/**
 * Tell the educator when a lock change from Educator Control or a card's Unlock button was not saved
 * (Rule 0657). The switch is already back on the previous setting, so trying again is the same action.
 */
export async function reportLockChange(change: Promise<LockChangeResult>): Promise<LockChangeResult> {
  const result = await change;
  if (result === "unsaved") toaster.error({ title: t("lecturer.locks.unsaved"), description: t("lecturer.locks.unsavedHelp") });
  return result;
}
