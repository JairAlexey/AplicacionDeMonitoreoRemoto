import { describe, expect, it } from "vitest";

import { EvalTechAPI } from "../index";

describe("EvalTechAPI", () => {
  it("exposes known endpoint paths", () => {
    expect(EvalTechAPI.verifyKey).toBe("/events/api/verify-event-key");
    expect(EvalTechAPI.logHttpRequest).toBe("/events/api/logging/http-request");
    expect(EvalTechAPI.mediaCapture).toBe("/events/api/logging/media/capture");
  });
});
