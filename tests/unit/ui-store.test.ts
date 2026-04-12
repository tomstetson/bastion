import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "../../src/store/ui";

describe("UI Store", () => {
  beforeEach(() => {
    // Reset store to default state before each test
    useUIStore.setState({
      activeProjectId: null,
      focusedTileSessionId: null,
      zoomedSessionId: null,
      poppedOutSessionIds: new Set(),
      statusFilter: null,
      sidebarWidth: 220,
      standaloneGridLayout: "auto",
    });
  });

  describe("zoom", () => {
    it("toggleZoom sets zoomedSessionId", () => {
      useUIStore.getState().toggleZoom("session-1");
      expect(useUIStore.getState().zoomedSessionId).toBe("session-1");
    });

    it("toggleZoom unsets if same session", () => {
      useUIStore.getState().toggleZoom("session-1");
      useUIStore.getState().toggleZoom("session-1");
      expect(useUIStore.getState().zoomedSessionId).toBeNull();
    });

    it("toggleZoom switches to different session", () => {
      useUIStore.getState().toggleZoom("session-1");
      useUIStore.getState().toggleZoom("session-2");
      expect(useUIStore.getState().zoomedSessionId).toBe("session-2");
    });

    it("toggleZoom with null clears zoom", () => {
      useUIStore.getState().toggleZoom("session-1");
      useUIStore.getState().toggleZoom(null);
      expect(useUIStore.getState().zoomedSessionId).toBeNull();
    });

    it("setActiveProject clears zoom", () => {
      useUIStore.getState().toggleZoom("session-1");
      useUIStore.getState().setActiveProject("project-2");
      expect(useUIStore.getState().zoomedSessionId).toBeNull();
    });
  });

  describe("popout", () => {
    it("addPopOut adds session to set", () => {
      useUIStore.getState().addPopOut("session-1");
      expect(useUIStore.getState().poppedOutSessionIds.has("session-1")).toBe(
        true,
      );
    });

    it("removePopOut removes session from set", () => {
      useUIStore.getState().addPopOut("session-1");
      useUIStore.getState().removePopOut("session-1");
      expect(useUIStore.getState().poppedOutSessionIds.has("session-1")).toBe(
        false,
      );
    });

    it("isSessionPoppedOut returns correct value", () => {
      expect(useUIStore.getState().isSessionPoppedOut("session-1")).toBe(false);
      useUIStore.getState().addPopOut("session-1");
      expect(useUIStore.getState().isSessionPoppedOut("session-1")).toBe(true);
    });

    it("multiple sessions can be popped out", () => {
      useUIStore.getState().addPopOut("session-1");
      useUIStore.getState().addPopOut("session-2");
      expect(useUIStore.getState().poppedOutSessionIds.size).toBe(2);
    });
  });
});
