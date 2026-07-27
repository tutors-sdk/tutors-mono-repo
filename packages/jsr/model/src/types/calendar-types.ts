/**
 * Calendar & enrollent related types
 */

/**
 * Represents a week in the course calendar
 */
export type WeekType = {
  title: string;
  type: string;
  date: string;
  dateObj: Date;
};

/**
 * Course calendar structure
 */
export type Calendar = {
  title: string;
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
  whitelist: string[];
  students: Student[];
};