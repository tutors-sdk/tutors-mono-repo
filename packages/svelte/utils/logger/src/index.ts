import log from "loglevel";

const originalFactory = log.methodFactory;

log.methodFactory = function (methodName, logLevel, loggerName) {
  const rawMethod = originalFactory(methodName, logLevel, loggerName);
  return function (...args: unknown[]) {
    const prefix = `[tutors:${methodName}]`;
    rawMethod(prefix, ...args);
  };
};

log.setDefaultLevel(import.meta.env.DEV ? "debug" : "warn");
log.rebuild();

export default log;
