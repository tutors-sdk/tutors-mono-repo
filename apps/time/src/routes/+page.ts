import type { PageLoad } from './$types';

// Don't fetch data on initial load - wait for courseid from dialog
export const load: PageLoad = async () => {
  return {
    calendarData: [],
    error: null,
    courseid: null
  };
};
