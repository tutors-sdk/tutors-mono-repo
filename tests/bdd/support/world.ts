/** Shapes the mock data factories in `extended-fixtures.ts` build. */

interface MockTopic {
  id: string;
  title: string;
  units: MockUnit[];
  los: MockLearningObject[];
}

interface MockUnit {
  id: string;
  title: string;
  los: MockLearningObject[];
}

export interface MockLearningObject {
  type: string;
  title: string;
  route: string;
  img?: string;
  icon?: string;
  summary?: string;
  parent?: MockTopic | MockUnit;
}
