/**
 * Every port's contract suite, run against the in-memory adapter the anonymous reader and the tests
 * compose, and against the other adapters that need no network: the two cannot drift. The Supabase
 * adapters run the same suites in tests/contract against recorded clients.
 */
import { describe, it } from "vitest";
import {
  accessStoreContract,
  eventPublisherContract,
  InMemoryAccessStore,
  InMemoryLearningEventSink,
  InMemoryPresence,
  InMemoryProfile,
  learningEventSinkContract,
  presenceContract,
  profileContract,
  RecordingPublisher,
  type ContractCase
} from "@tutors/application/testing";
import { localStorageProfile, type KeyValueStorage } from "@tutors/profile-localstorage";
import { inProcessPublisher } from "@tutors/bus-inprocess";

function contract(name: string, cases: ContractCase[]) {
  describe(name, () => {
    for (const c of cases) it(c.name, c.run);
  });
}

function memoryStorage(): KeyValueStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key)
  };
}

/** localStorage holds one learner's record, so the per-learner cases are read for that one learner. */
const singleLearnerCases = (cases: ContractCase[]) => cases.filter((c) => !/per learner/.test(c.name));

contract("ProfilePort: in memory", profileContract(() => new InMemoryProfile()));
contract(
  "ProfilePort: localStorage",
  singleLearnerCases(
    profileContract(() => {
      const storage = memoryStorage();
      return localStorageProfile(() => storage);
    })
  )
);
contract("AccessStore: in memory", accessStoreContract(() => new InMemoryAccessStore()));
contract("PresencePort: in memory", presenceContract(() => new InMemoryPresence()));
contract("EventPublisher: in memory", eventPublisherContract(() => new RecordingPublisher()));
contract("EventPublisher: in process", eventPublisherContract(() => inProcessPublisher()));
contract("LearningEventSink: in memory", learningEventSinkContract(() => new InMemoryLearningEventSink()));
