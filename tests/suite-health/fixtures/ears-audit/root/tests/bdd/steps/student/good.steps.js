import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";

const feature = await loadFeature("tests/bdd/features/student/good.feature");

describeFeature(feature, ({ Rule }) => {
  Rule("The catalogue shall list each course with its title.", () => {});
  Rule("When a student searches by keyword, the reader shall list the matching learning objects.", () => {});
  Rule("While a student is signed in, tutors shall record the student's activity.", () => {});
  Rule("If the course host is unreachable, then the reader shall show a retry message.", () => {});
  Rule("Where a course enables the calendar, the time dashboard shall show a calendar view.", () => {});
});
