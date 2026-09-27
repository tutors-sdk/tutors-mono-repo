<script lang="ts">
  import type { TutorsTimeStudent } from "@tutors/tutors-time-lib";
  import { extractLabIdentifier, extractStepName, formatDateShort } from "@tutors/tutors-time-lib";
  import { t } from "@tutors/i18n";
  import ActivityTable from "./ActivityTable.svelte";

  let { studentCalendar }: { studentCalendar: TutorsTimeStudent } = $props();
  const course = $derived(studentCalendar.course);
  const dated = (keys: string[] = []) => keys.map(key => ({ key, label: formatDateShort(key) }));
</script>

<ActivityTable title={t("time.calendarByWeek")} columns={dated(course?.weeks)} rows={[
  { label: studentCalendar.calendarByWeek?.full_name ?? "", values: studentCalendar.calendarByWeek, total: studentCalendar.calendarByWeek?.totalSeconds },
  { label: t("time.median"), values: course?.calendarModel?.medianByWeek?.row, total: course?.calendarModel?.medianByWeek?.row?.totalSeconds, median: true }
]} />
<ActivityTable title={t("time.calendarByDay")} columns={dated(course?.dates)} rows={[
  { label: studentCalendar.calendarByDay?.full_name ?? "", values: studentCalendar.calendarByDay, total: studentCalendar.calendarByDay?.totalSeconds },
  { label: t("time.median"), values: course?.calendarModel?.medianByDay?.row, total: course?.calendarModel?.medianByDay?.row?.totalSeconds, median: true }
]} />
<ActivityTable title={t("time.labByLab")} columns={(course?.labColumns ?? []).map(key => ({ key, label: extractLabIdentifier(key) }))} rows={[
  { label: studentCalendar.labsByLab?.full_name ?? "", values: studentCalendar.labsByLab, total: studentCalendar.labsByLab?.totalMinutes },
  { label: t("time.median"), values: course?.labsModel?.medianByLab?.row, total: course?.labsModel?.medianByLab?.row?.totalMinutes, median: true }
]} />
<ActivityTable title={t("time.labByStep")} columns={(course?.stepColumns ?? []).map(key => ({ key, label: extractStepName(key) }))} rows={[
  { label: studentCalendar.labsByStep?.full_name ?? "", values: studentCalendar.labsByStep, total: studentCalendar.labsByStep?.totalMinutes },
  { label: t("time.median"), values: course?.labsModel?.medianByLabStep?.row, total: course?.labsModel?.medianByLabStep?.row?.totalMinutes, median: true }
]} />
