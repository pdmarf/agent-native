// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

vi.mock("@agent-native/core/client/i18n", () => ({
  useT: () => (key: string) => key,
}));
vi.mock("@/lib/utils", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

import type { VideoRedaction } from "@/lib/video-redactions";

import {
  RedactionLane,
  redactionLaneHeight,
  VISIBLE_REDACTION_ROWS,
} from "./redaction-lane";

const DURATION = 10_000;
const WIDTH = 1_000;

const redaction: VideoRedaction = {
  id: "r1",
  kind: "redact",
  style: "solid",
  startMs: 2_000,
  endMs: 4_000,
  keys: [{ atMs: 2_000, x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
};

function pointer(
  target: Element,
  type: string,
  clientX: number,
  init: { shiftKey?: boolean } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX,
    button: 0,
    ...init,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}

describe("dragging a redaction's edges", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onCommit: Mock<(next: VideoRedaction[]) => void>;

  const render = (redactions: VideoRedaction[]) => {
    act(() => {
      root.render(
        <RedactionLane
          width={WIDTH}
          viewportWidth={WIDTH}
          scrollLeft={0}
          durationMs={DURATION}
          redactions={redactions}
          selectedId={null}
          onSelect={vi.fn()}
          onPreview={vi.fn()}
          onCommit={onCommit}
        />,
      );
    });
  };

  // The rows themselves, inside the lane's scrolling box.
  const lane = () => container.querySelector(".relative")!;
  const grip = (label: string) =>
    container.querySelector(`[aria-label="${label}"]`) as HTMLElement;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: WIDTH,
      bottom: 22,
      width: WIDTH,
      height: 22,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    onCommit = vi.fn<(next: VideoRedaction[]) => void>();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("moves the end where it is dragged", () => {
    render([redaction]);
    const end = grip("redaction.endsAt");

    act(() => {
      pointer(end, "pointerdown", 400);
      pointer(lane(), "pointermove", 700);
      pointer(lane(), "pointerup", 700);
    });

    expect(onCommit.mock.calls[0][0][0]).toMatchObject({ endMs: 7_000 });
  });

  it("stops the end at the end of the clip, however far the pointer goes", () => {
    render([redaction]);
    const end = grip("redaction.endsAt");

    act(() => {
      pointer(end, "pointerdown", 400);
      pointer(lane(), "pointermove", 4_000);
      pointer(lane(), "pointerup", 4_000);
    });

    expect(onCommit.mock.calls[0][0][0]).toMatchObject({ endMs: DURATION });
  });

  it("brings back a waypoint when the end is dragged back out before letting go", () => {
    const moving: VideoRedaction = {
      ...redaction,
      keys: [
        { atMs: 2_000, x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        { atMs: 3_500, x: 0.5, y: 0.1, w: 0.2, h: 0.2 },
      ],
    };
    render([moving]);
    const end = grip("redaction.endsAt");

    act(() => {
      pointer(end, "pointerdown", 400);
      pointer(lane(), "pointermove", 300);
      pointer(lane(), "pointermove", 400);
      pointer(lane(), "pointerup", 400);
    });

    expect(onCommit.mock.calls[0][0][0].keys).toEqual(moving.keys);
  });

  it("keeps a waypoint the end is let go short of, but hides it", () => {
    const moving: VideoRedaction = {
      ...redaction,
      keys: [
        { atMs: 2_000, x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        { atMs: 3_500, x: 0.5, y: 0.1, w: 0.2, h: 0.2 },
      ],
    };
    render([moving]);
    const end = grip("redaction.endsAt");

    act(() => {
      pointer(end, "pointerdown", 400);
      pointer(lane(), "pointermove", 300);
      pointer(lane(), "pointerup", 300);
    });

    const shorter = onCommit.mock.calls[0][0][0];
    expect(shorter.endMs).toBe(3_000);
    expect(shorter.keys.map((k: { atMs: number }) => k.atMs)).toEqual([
      2_000, 3_500,
    ]);

    render([shorter]);
    expect(
      container.querySelectorAll('[aria-label="redaction.waypoint"]'),
    ).toHaveLength(1);
  });

  it("stops the start at the beginning", () => {
    render([redaction]);
    const start = grip("redaction.startsAt");

    act(() => {
      pointer(start, "pointerdown", 200);
      pointer(lane(), "pointermove", -900);
      pointer(lane(), "pointerup", -900);
    });

    expect(onCommit.mock.calls[0][0][0]).toMatchObject({ startMs: 0 });
  });

  it("pins a waypoint where the bar is clicked", () => {
    render([redaction]);
    const bar = container.querySelector('[role="button"]')!;

    act(() => {
      pointer(bar, "pointerdown", 300);
      pointer(bar, "pointerup", 300);
    });

    expect(onCommit.mock.calls[0][0][0].keys.map((k) => k.atMs)).toEqual([
      2_000, 3_000,
    ]);
  });

  it("does not pin one when the press was a drag", () => {
    render([redaction]);
    const bar = container.querySelector('[role="button"]')!;

    act(() => {
      pointer(bar, "pointerdown", 300);
      pointer(bar, "pointerup", 380);
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does not pin one where there is already a waypoint", () => {
    render([redaction]);
    const bar = container.querySelector('[role="button"]')!;

    act(() => {
      pointer(bar, "pointerdown", 200, { shiftKey: true });
      pointer(bar, "pointerup", 200, { shiftKey: true });
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("removes a waypoint when it is pressed twice", () => {
    const twoKeys: VideoRedaction = {
      ...redaction,
      keys: [
        { atMs: 2_000, x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        { atMs: 3_000, x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
      ],
    };
    render([twoKeys]);
    const diamond = container.querySelectorAll(
      '[aria-label^="redaction.waypoint"]',
    )[1];

    act(() => {
      pointer(diamond, "pointerdown", 300);
      pointer(lane(), "pointerup", 300);
      pointer(diamond, "pointerdown", 300);
    });

    expect(onCommit.mock.calls[0][0][0].keys.map((k) => k.atMs)).toEqual([
      2_000,
    ]);
  });

  it("keeps the last waypoint on the bar, though one past the end is hidden", () => {
    const shortened: VideoRedaction = {
      ...redaction,
      endMs: 2_500,
      keys: [
        { atMs: 2_000, x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        { atMs: 3_000, x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
      ],
    };
    render([shortened]);
    const diamonds = container.querySelectorAll(
      '[aria-label^="redaction.waypoint"]',
    );
    expect(diamonds).toHaveLength(1);

    act(() => {
      pointer(diamonds[0], "pointerdown", 200);
      pointer(lane(), "pointerup", 200);
      pointer(diamonds[0], "pointerdown", 200);
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("keeps the last waypoint, since a box has to be somewhere", () => {
    render([redaction]);
    const diamond = container.querySelector(
      '[aria-label^="redaction.waypoint"]',
    )!;

    act(() => {
      pointer(diamond, "pointerdown", 200);
      pointer(lane(), "pointerup", 200);
      pointer(diamond, "pointerdown", 200);
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("draws a bar that has run past the end no wider than the track", () => {
    render([{ ...redaction, startMs: 9_000, endMs: 40_000 }]);
    const bar = container.querySelector('[role="button"]') as HTMLElement;
    const left = Number.parseFloat(bar.style.left);
    const width = Number.parseFloat(bar.style.width);
    expect(left + width).toBeLessThanOrEqual(WIDTH);
  });
});

describe("more redactions than the lane shows at once", () => {
  it("scrolls the lane to a redaction selected from elsewhere", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    // Nine boxes on screen at once, so nine rows — past what fits.
    const many: VideoRedaction[] = Array.from({ length: 9 }, (_, i) => ({
      ...redaction,
      id: `r${i}`,
    }));
    const renderWith = (selectedId: string | null) =>
      act(() => {
        root.render(
          <RedactionLane
            width={WIDTH}
            viewportWidth={WIDTH}
            scrollLeft={0}
            durationMs={DURATION}
            redactions={many}
            selectedId={selectedId}
            onSelect={vi.fn()}
            onPreview={vi.fn()}
            onCommit={vi.fn()}
          />,
        );
      });

    renderWith(null);
    const scroller = container.firstElementChild as HTMLElement;
    Object.defineProperty(scroller, "clientHeight", {
      value: redactionLaneHeight(VISIBLE_REDACTION_ROWS),
    });
    expect(scroller.scrollTop).toBe(0);

    // Every bar has a row of its own: none is drawn over another.
    const tops = [
      ...container.querySelectorAll<HTMLElement>("[aria-pressed]"),
    ].map((bar) => bar.style.top);
    expect(new Set(tops).size).toBe(9);

    renderWith("r8");
    expect(scroller.scrollTop).toBeGreaterThan(0);

    renderWith("r0");
    expect(scroller.scrollTop).toBe(0);

    act(() => root.unmount());
    container.remove();
  });

  function mount(node: React.ReactElement) {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(node));
    return {
      container,
      done: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  }

  const lanePropsFor = (redactions: VideoRedaction[]) => ({
    width: WIDTH,
    viewportWidth: WIDTH,
    scrollLeft: 0,
    durationMs: DURATION,
    redactions,
    selectedId: null,
    onSelect: vi.fn(),
    onPreview: vi.fn(),
    onCommit: vi.fn(),
  });

  it("scrolls only once there are more rows than it shows", () => {
    const stacked = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...redaction, id: `r${i}` }));

    const few = mount(<RedactionLane {...lanePropsFor(stacked(2))} />);
    const small = few.container.firstElementChild as HTMLElement;
    expect(small.className).not.toContain("clips-lane-scroll");
    expect(small.style.width).toBe(`${WIDTH}px`);
    few.done();

    const lots = mount(<RedactionLane {...lanePropsFor(stacked(9))} />);
    const big = lots.container.firstElementChild as HTMLElement;
    expect(big.className).toContain("clips-lane-scroll");
    expect(big.style.maxHeight).toBe(
      `${redactionLaneHeight(VISIBLE_REDACTION_ROWS)}px`,
    );
    lots.done();
  });

  it("keeps every bar on its row while one is dragged", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: WIDTH,
      bottom: 22,
      width: WIDTH,
      height: 22,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    // Staggered starts, so each is on its own row, the last one lowest.
    const staggered = Array.from({ length: 5 }, (_, i) => ({
      ...redaction,
      id: `r${i}`,
      startMs: 1_000 + i * 500,
      endMs: 6_000,
      keys: [{ ...redaction.keys[0], atMs: 1_000 + i * 500 }],
    }));
    function Live() {
      const [preview, setPreview] = React.useState<VideoRedaction[] | null>(
        null,
      );
      return (
        <RedactionLane
          {...lanePropsFor(preview ?? staggered)}
          onPreview={setPreview}
        />
      );
    }
    const { container, done } = mount(<Live />);
    const bars = () => [
      ...container.querySelectorAll<HTMLElement>("[aria-pressed]"),
    ];
    const barOf = (id: string) => bars()[Number(id.slice(1))];
    const scroller = container.firstElementChild as HTMLElement;
    const topsBefore = bars().map((b) => b.style.top);
    const heightBefore = scroller.style.maxHeight;

    // Drag the lowest bar's start to the very beginning: packed afresh, it
    // would jump to the top row, which may be scrolled out of sight.
    const start = barOf("r4").querySelector(
      '[aria-label="redaction.startsAt"]',
    )!;
    act(() => {
      pointer(start, "pointerdown", 300);
      pointer(container.querySelector(".relative")!, "pointermove", 0);
    });
    expect(bars().map((b) => b.style.top)).toEqual(topsBefore);
    expect(scroller.style.maxHeight).toBe(heightBefore);
    expect(barOf("r4").style.left).toBe("0px");

    act(() => {
      pointer(container.querySelector(".relative")!, "pointerup", 0);
    });
    done();
    vi.restoreAllMocks();
  });
});
