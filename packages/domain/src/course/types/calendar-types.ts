/**
 * Calendar & enrollment related types
 */

/**
 * Assessment associated with a calendar week
 */
export type Assessment = {
  name: string;
  due: string;
  percentage: number;
  submission: string;
};

/**
 * Represents a week in the course calendar
 */
export type WeekType = {
  title: string;
  type: string;
  date: string;
  dateObj: Date;
  weekNumber?: number;
  assessment?: Assessment;
};

/**
 * Course calendar structure
 */
export type Calendar = {
  title: string;
  year?: number;
  weeks: WeekType[];
  currentWeek?: WeekType;
};

/*
* Enrollment type
* Represents a list of students and their IDs
*/
export type Student = {
  name:string, 
  id:string
}

/*
* Enrollment type
* Represents a list of authorised students and their IDs
*/
export type Enrollment = {
  educators?: string[];
  whitelist: string[];
  students: Student[];
};