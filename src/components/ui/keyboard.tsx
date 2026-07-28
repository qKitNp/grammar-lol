'use client';

import { cn } from "@/lib/utils";
import {
  IconArrowNarrowLeft,
  IconBrightnessDown,
  IconBrightnessUp,
  IconBulb,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCommand,
  IconFrame,
  IconLayoutDashboard,
  IconMicrophone,
  IconMoon,
  IconPlayerSkipForward,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconSearch,
  IconVolume,
  IconVolume2,
  IconVolume3,
} from "@tabler/icons-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useWebHaptics } from "web-haptics/react";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export type KeyboardEventSource = "physical" | "pointer";
export type KeyboardEventPhase = "down" | "up";
export type KeyboardThemeName = "classic" | "mint" | "royal" | "dolch" | "sand" | "scarlet";

export interface KeyboardInteractionEvent {
  code: string;
  phase: KeyboardEventPhase;
  source: KeyboardEventSource;
}

export interface KeyboardProps {
  className?: string;
  theme?: KeyboardThemeName;
  enableHaptics?: boolean;
  enableSound?: boolean;
  soundUrl?: string;
  onKeyEvent?: (event: KeyboardInteractionEvent) => void;
}

export function Keyboard({
  className,
  theme = "classic",
  enableSound = true,
  enableHaptics = true,
  soundUrl = "/sounds/sound.ogg",
  onKeyEvent,
}: KeyboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <KeyboardProvider
      containerRef={containerRef}
      theme={theme}
      enableSound={enableSound}
      enableHaptics={enableHaptics}
      soundUrl={soundUrl}
      onKeyEvent={onKeyEvent}
    >
      <div ref={containerRef} className={cn("inline-block", className)}>
        <KeyboardLayout />
      </div>
    </KeyboardProvider>
  );
}

export default Keyboard;

// -----------------------------------------------------------------------------
// Internal keyboard context
// -----------------------------------------------------------------------------

interface KeyboardContextType {
  themeName: KeyboardThemeName;
  pressedKeys: Set<string>;
  lastPressedKey: string | null;
  triggerPointerHaptic: () => void;
  pressKey: (keyCode: string, source: KeyboardEventSource) => void;
  releaseKey: (keyCode: string, source: KeyboardEventSource) => void;
  releaseAllKeys: (source?: KeyboardEventSource) => void;
}

const KeyboardContext = createContext<KeyboardContextType | null>(null);

function useKeyboardContext() {
  const context = useContext(KeyboardContext);
  if (!context) {
    throw new Error("Keyboard components must be used within KeyboardProvider");
  }
  return context;
}

interface KeyboardProviderProps {
  children: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
  theme: KeyboardThemeName;
  enableSound: boolean;
  enableHaptics: boolean;
  soundUrl: string;
  onKeyEvent?: (event: KeyboardInteractionEvent) => void;
}

function KeyboardProvider({
  children,
  containerRef,
  theme,
  enableSound,
  enableHaptics,
  soundUrl,
  onKeyEvent,
}: KeyboardProviderProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const { trigger } = useWebHaptics();

  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [lastPressedKey, setLastPressedKey] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!enableSound || !soundUrl) {
      audioBufferRef.current = null;
      return;
    }

    let cancelled = false;

    const initAudio = async () => {
      try {
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const response = await fetch(soundUrl);
        if (!response.ok) {
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        if (!cancelled) {
          audioBufferRef.current = audioBuffer;
        }
      } catch {
        // Sound is optional. Keep UI interactive if loading fails.
      }
    };

    void initAudio();

    return () => {
      cancelled = true;
      audioBufferRef.current = null;

      const context = audioContextRef.current;
      audioContextRef.current = null;
      void context?.close();
    };
  }, [enableSound, soundUrl]);

  const playSound = useCallback(
    async (phase: KeyboardEventPhase, keyCode: string) => {
      if (!enableSound) {
        return;
      }

      const audioContext = audioContextRef.current;
      const audioBuffer = audioBufferRef.current;
      if (!audioContext || !audioBuffer) {
        return;
      }

      const soundDef =
        phase === "down" ? SOUND_DEFINES_DOWN[keyCode] : SOUND_DEFINES_UP[keyCode];
      if (!soundDef) {
        return;
      }

      const [startMs, durationMs] = soundDef;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0, startMs / 1000, durationMs / 1000);
    },
    [enableSound],
  );

  const emitKeyEvent = useCallback(
    (phase: KeyboardEventPhase, code: string, source: KeyboardEventSource) => {
      onKeyEvent?.({ code, phase, source });
    },
    [onKeyEvent],
  );

  const triggerPointerHaptic = useCallback(() => {
    if (!enableHaptics) {
      return;
    }

    void trigger([
      { duration: 25 },
    ], { intensity: 0.7 })
  }, [enableHaptics, trigger]);

  const pressKey = useCallback(
    (keyCode: string, source: KeyboardEventSource) => {
      if (pressedKeysRef.current.has(keyCode)) {
        return;
      }

      const next = new Set(pressedKeysRef.current);
      next.add(keyCode);
      pressedKeysRef.current = next;
      setPressedKeys(next);

      setLastPressedKey(keyCode);
      void playSound("down", keyCode);
      emitKeyEvent("down", keyCode, source);
    },
    [emitKeyEvent, playSound],
  );

  const releaseKey = useCallback(
    (keyCode: string, source: KeyboardEventSource) => {
      if (!pressedKeysRef.current.has(keyCode)) {
        return;
      }

      const next = new Set(pressedKeysRef.current);
      next.delete(keyCode);
      pressedKeysRef.current = next;
      setPressedKeys(next);

      void playSound("up", keyCode);
      emitKeyEvent("up", keyCode, source);
    },
    [emitKeyEvent, playSound],
  );

  const releaseAllKeys = useCallback(
    (source: KeyboardEventSource = "physical") => {
      const keysToRelease = Array.from(pressedKeysRef.current);
      if (keysToRelease.length === 0) {
        return;
      }

      pressedKeysRef.current = new Set();
      setPressedKeys(new Set());

      for (const keyCode of keysToRelease) {
        emitKeyEvent("up", keyCode, source);
      }
    },
    [emitKeyEvent],
  );

  useEffect(() => {
    const handleBlur = () => {
      releaseAllKeys();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        releaseAllKeys();
      }
    };

    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [releaseAllKeys]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      pressKey(event.code, "physical");
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      releaseKey(event.code, "physical");
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [isVisible, pressKey, releaseKey]);

  return (
    <KeyboardContext.Provider
      value={{
        themeName: theme,
        pressedKeys,
        lastPressedKey,
        triggerPointerHaptic,
        pressKey,
        releaseKey,
        releaseAllKeys,
      }}
    >
      {children}
    </KeyboardContext.Provider>
  );
}

// -----------------------------------------------------------------------------
// UI rendering
// -----------------------------------------------------------------------------

function KeyboardLayout() {
  return (
    <div>
      <div className="bg-black/70 border-2 border-black p-3 rounded-[16px] w-fit h-fit">
        <div className="bg-black/80 border border-black rounded-[5px] rounded-t-[8px] h-[278px]">
          <div className="-space-y-1 -translate-y-1 rounded-[5px] overflow-hidden">
            <Row>
              <Key keyCode={KEYCODE.Escape}>
                {"esc"}
              </Key>

              <Key keyCode={KEYCODE.F1}>
                <IconBrightnessDown className="size-[10px]" />
                <span>{"F1"}</span>
              </Key>
              <Key keyCode={KEYCODE.F2}>
                <IconBrightnessUp className="size-[10px]" />
                <span>{"F2"}</span>
              </Key>
              <Key keyCode={KEYCODE.F3}>
                <IconLayoutDashboard className="size-[10px]" />
                <span>{"F3"}</span>
              </Key>
              <Key keyCode={KEYCODE.F4}>
                <IconSearch className="size-[10px]" />
                <span>{"F4"}</span>
              </Key>

              <Key keyCode={KEYCODE.F5}>
                <IconMicrophone className="size-[10px]" />
                <span>{"F5"}</span>
              </Key>
              <Key keyCode={KEYCODE.F6}>
                <IconMoon className="size-[10px]" />
                <span>{"F6"}</span>
              </Key>
              <Key keyCode={KEYCODE.F7}>
                <IconPlayerTrackPrev className="size-[10px]" />
                <span>{"F7"}</span>
              </Key>
              <Key keyCode={KEYCODE.F8}>
                <IconPlayerSkipForward className="size-[10px]" />
                <span>{"F8"}</span>
              </Key>
              <Key keyCode={KEYCODE.F9}>
                <IconPlayerTrackNext className="size-[10px]" />
                <span>{"F9"}</span>
              </Key>

              <Key keyCode={KEYCODE.F10}>
                <IconVolume3 className="size-[10px]" />
                <span>{"F10"}</span>
              </Key>
              <Key keyCode={KEYCODE.F11}>
                <IconVolume2 className="size-[10px]" />
                <span>{"F11"}</span>
              </Key>
              <Key keyCode={KEYCODE.F12}>
                <IconVolume className="size-[10px]" />
                <span>{"F12"}</span>
              </Key>

              <Key keyCode={KEYCODE.F13}>
                <IconFrame className="size-[10px]" />
              </Key>
              <Key keyCode={KEYCODE.Delete}>
                {"del"}
              </Key>
              <Key keyCode={KEYCODE.F14}>
                <IconBulb className="size-[12px]" />
              </Key>
            </Row>

            <Row>
              <Key keyCode={KEYCODE.Backquote}>
                <span>{"~"}</span>
                <span>{"`"}</span>
              </Key>

              <Key keyCode={KEYCODE.Digit1}>
                <span>{"!"}</span>
                <span>{"1"}</span>
              </Key>
              <Key keyCode={KEYCODE.Digit2}>
                <span>{"@"}</span>
                <span>{"2"}</span>
              </Key>
              <Key keyCode={KEYCODE.Digit3}>
                <span>{"#"}</span>
                <span>{"3"}</span>
              </Key>
              <Key keyCode={KEYCODE.Digit4}>
                <span>{"$"}</span>
                <span>{"4"}</span>
              </Key>

              <Key keyCode={KEYCODE.Digit5}>
                <span>{"%"}</span>
                <span>{"5"}</span>
              </Key>
              <Key keyCode={KEYCODE.Digit6}>
                <span>{"^"}</span>
                <span>{"6"}</span>
              </Key>
              <Key keyCode={KEYCODE.Digit7}>
                <span>{"&"}</span>
                <span>{"7"}</span>
              </Key>
              <Key keyCode={KEYCODE.Digit8}>
                <span>{"*"}</span>
                <span>{"8"}</span>
              </Key>
              <Key keyCode={KEYCODE.Digit9}>
                <span>{"("}</span>
                <span>{"9"}</span>
              </Key>

              <Key keyCode={KEYCODE.Digit0}>
                <span>{")"}</span>
                <span>{"0"}</span>
              </Key>
              <Key keyCode={KEYCODE.Minus}>
                <span>{"_"}</span>
                <span>{"-"}</span>
              </Key>
              <Key keyCode={KEYCODE.Equal}>
                <span>{"+"}</span>
                <span>{"="}</span>
              </Key>

              <Key keyCode={KEYCODE.Backspace} width={100}>
                <IconArrowNarrowLeft className="size-[12px]" />
              </Key>
              <Key keyCode={KEYCODE.PageUp}>
                {"pgup"}
              </Key>
            </Row>

            <Row>
              <Key keyCode={KEYCODE.Tab} width={75}>
                {"tab"}
              </Key>

              <Key keyCode={KEYCODE.KeyQ}>{"Q"}</Key>
              <Key keyCode={KEYCODE.KeyW}>{"W"}</Key>
              <Key keyCode={KEYCODE.KeyE}>{"E"}</Key>
              <Key keyCode={KEYCODE.KeyR}>{"R"}</Key>

              <Key keyCode={KEYCODE.KeyT}>{"T"}</Key>
              <Key keyCode={KEYCODE.KeyY}>{"Y"}</Key>
              <Key keyCode={KEYCODE.KeyU}>{"U"}</Key>
              <Key keyCode={KEYCODE.KeyI}>{"I"}</Key>
              <Key keyCode={KEYCODE.KeyO}>{"O"}</Key>
              <Key keyCode={KEYCODE.KeyP}>{"P"}</Key>

              <Key keyCode={KEYCODE.BracketLeft}>
                <span>{"{"}</span>
                <span>{"["}</span>
              </Key>
              <Key keyCode={KEYCODE.BracketRight}>
                <span>{"}"}</span>
                <span>{"]"}</span>
              </Key>

              <Key keyCode={KEYCODE.Backslash} width={75}>
                <span>{"|"}</span>
                <span>{"\\"}</span>
              </Key>
              <Key keyCode={KEYCODE.PageDown}>
                {"pgdn"}
              </Key>
            </Row>

            <Row>
              <Key keyCode={KEYCODE.CapsLock} width={100}>
                {"caps lock"}
              </Key>

              <Key keyCode={KEYCODE.KeyA}>{"A"}</Key>
              <Key keyCode={KEYCODE.KeyS}>{"S"}</Key>
              <Key keyCode={KEYCODE.KeyD}>{"D"}</Key>
              <Key keyCode={KEYCODE.KeyF}>{"F"}</Key>

              <Key keyCode={KEYCODE.KeyG}>{"G"}</Key>
              <Key keyCode={KEYCODE.KeyH}>{"H"}</Key>
              <Key keyCode={KEYCODE.KeyJ}>{"J"}</Key>
              <Key keyCode={KEYCODE.KeyK}>{"K"}</Key>
              <Key keyCode={KEYCODE.KeyL}>{"L"}</Key>

              <Key keyCode={KEYCODE.Semicolon}>
                <span>{":"}</span>
                <span>{";"}</span>
              </Key>
              <Key keyCode={KEYCODE.Quote}>
                <span>{"\""}</span>
                <span>{"'"}</span>
              </Key>

              <Key keyCode={KEYCODE.Enter} width={100}>
                {"return"}
              </Key>
              <Key keyCode={KEYCODE.Home}>
                {"home"}
              </Key>
            </Row>

            <Row>
              <Key keyCode={KEYCODE.ShiftLeft} width={123}>
                {"shift"}
              </Key>

              <Key keyCode={KEYCODE.KeyZ}>{"Z"}</Key>
              <Key keyCode={KEYCODE.KeyX}>{"X"}</Key>
              <Key keyCode={KEYCODE.KeyC}>{"C"}</Key>
              <Key keyCode={KEYCODE.KeyV}>{"V"}</Key>

              <Key keyCode={KEYCODE.KeyB}>{"B"}</Key>
              <Key keyCode={KEYCODE.KeyN}>{"N"}</Key>
              <Key keyCode={KEYCODE.KeyM}>{"M"}</Key>

              <Key keyCode={KEYCODE.Comma}>
                <span>{"<"}</span>
                <span>{","}</span>
              </Key>
              <Key keyCode={KEYCODE.Period}>
                <span>{">"}</span>
                <span>{"."}</span>
              </Key>
              <Key keyCode={KEYCODE.Slash}>
                <span>{"?"}</span>
                <span>{"/"}</span>
              </Key>

              <Key keyCode={KEYCODE.ShiftRight} width={77}>
                {"shift"}
              </Key>
              <Key keyCode={KEYCODE.ArrowUp}>
                <IconChevronUp className="size-[12px]" />
              </Key>
              <Key keyCode={KEYCODE.End}>
                {"end"}
              </Key>
            </Row>

            <Row>
              <Key keyCode={KEYCODE.ControlLeft} width={62}>
                {"ctrl"}
              </Key>
              <Key keyCode={KEYCODE.AltLeft} width={62}>
                {"option"}
              </Key>
              <Key keyCode={KEYCODE.MetaLeft} width={62}>
                <IconCommand className="size-[12px]" />
              </Key>

              <Key keyCode={KEYCODE.Space} width={314} />

              <Key keyCode={KEYCODE.MetaRight}>
                <IconCommand className="size-[12px]" />
              </Key>
              <Key keyCode={KEYCODE.Fn}>
                {"fn"}
              </Key>
              <Key keyCode={KEYCODE.ControlRight}>
                {"ctrl"}
              </Key>
              <Key keyCode={KEYCODE.ArrowLeft}>
                <IconChevronLeft className="size-[12px]" />
              </Key>
              <Key keyCode={KEYCODE.ArrowDown}>
                <IconChevronDown className="size-[12px]" />
              </Key>
              <Key keyCode={KEYCODE.ArrowRight}>
                <IconChevronRight className="size-[12px]" />
              </Key>
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex">{children}</div>;
}

interface KeyProps {
  width?: number;
  children?: ReactNode;
  className?: string;
  keyCode?: KEYCODE;
}

function Key({
  width = 50,
  children,
  className,
  keyCode,
}: KeyProps) {
  const { themeName, pressedKeys, pressKey, releaseKey, triggerPointerHaptic } = useKeyboardContext();
  const isPressed = keyCode ? pressedKeys.has(keyCode) : false;
  const keyVariantSlot = resolveKeyVariant(themeName, keyCode);
  const keyVariant = KEYBOARD_THEMES[themeName].variants[keyVariantSlot];

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!keyCode || event.button !== 0 || isPressed) {
      return;
    }

    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture failures on browsers/platforms that do not support this path.
    }
    pressKey(keyCode, "pointer");
  };

  const handlePointerRelease = () => {
    if (!keyCode || !isPressed) {
      return;
    }

    releaseKey(keyCode, "pointer");
  };

  return (
    <button
      type="button"
      onClick={triggerPointerHaptic}
      aria-label={keyCode}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
      onPointerLeave={handlePointerRelease}
      onLostPointerCapture={handlePointerRelease}
      style={{ height: 50, width }}
      className="flex items-end cursor-pointer touch-none appearance-none border-0 bg-transparent p-0 text-left focus:outline-none"
    >
      <div
        className={cn(
          "relative overflow-hidden h-[50px] rounded-[4px] rounded-t-[12px] border border-black/40 flex items-start justify-center transition-all duration-100",
          isPressed && "h-[45px]",
        )}
        style={{
          width: `${width}px`,
          backgroundColor: toRgba(keyVariant.bg, 0.8),
        }}
      >
        <div
          className={cn(
            "relative z-10 h-[37px] rounded-[6px] border border-t-0 border-black/40 transition-all duration-100",
            "text-[9px] font-medium flex flex-col items-center justify-between p-1 gap-0.5 select-none",
            className,
          )}
          style={{
            width: `${width - 13}px`,
            backgroundColor: keyVariant.bg,
            color: keyVariant.text,
          }}
        >
          {children}
        </div>

        <div
          className={cn(
            "absolute z-0 bottom-0 right-0 h-px w-8 rotate-70 translate-x-3.5 bg-black/30 transition-all duration-100",
            isPressed && "rotate-60",
          )}
        />
        <div
          className={cn(
            "absolute z-0 bottom-0 left-0 h-px w-8 -rotate-70 -translate-x-3.5 bg-black/30 transition-all duration-100",
            isPressed && "-rotate-60",
          )}
        />
      </div>
    </button>
  );
}

// -----------------------------------------------------------------------------
// Keyboard constants
// -----------------------------------------------------------------------------

export enum KEYCODE {
  Escape = "Escape",
  F1 = "F1",
  F2 = "F2",
  F3 = "F3",
  F4 = "F4",
  F5 = "F5",
  F6 = "F6",
  F7 = "F7",
  F8 = "F8",
  F9 = "F9",
  F10 = "F10",
  F11 = "F11",
  F12 = "F12",
  F13 = "F13",
  Delete = "Delete",
  F14 = "F14",
  Backquote = "Backquote",
  Digit1 = "Digit1",
  Digit2 = "Digit2",
  Digit3 = "Digit3",
  Digit4 = "Digit4",
  Digit5 = "Digit5",
  Digit6 = "Digit6",
  Digit7 = "Digit7",
  Digit8 = "Digit8",
  Digit9 = "Digit9",
  Digit0 = "Digit0",
  Minus = "Minus",
  Equal = "Equal",
  Backspace = "Backspace",
  PageUp = "PageUp",
  Tab = "Tab",
  KeyQ = "KeyQ",
  KeyW = "KeyW",
  KeyE = "KeyE",
  KeyR = "KeyR",
  KeyT = "KeyT",
  KeyY = "KeyY",
  KeyU = "KeyU",
  KeyI = "KeyI",
  KeyO = "KeyO",
  KeyP = "KeyP",
  BracketLeft = "BracketLeft",
  BracketRight = "BracketRight",
  Backslash = "Backslash",
  PageDown = "PageDown",
  CapsLock = "CapsLock",
  KeyA = "KeyA",
  KeyS = "KeyS",
  KeyD = "KeyD",
  KeyF = "KeyF",
  KeyG = "KeyG",
  KeyH = "KeyH",
  KeyJ = "KeyJ",
  KeyK = "KeyK",
  KeyL = "KeyL",
  Semicolon = "Semicolon",
  Quote = "Quote",
  Enter = "Enter",
  Home = "Home",
  ShiftLeft = "ShiftLeft",
  KeyZ = "KeyZ",
  KeyX = "KeyX",
  KeyC = "KeyC",
  KeyV = "KeyV",
  KeyB = "KeyB",
  KeyN = "KeyN",
  KeyM = "KeyM",
  Comma = "Comma",
  Period = "Period",
  Slash = "Slash",
  ShiftRight = "ShiftRight",
  ArrowUp = "ArrowUp",
  End = "End",
  ControlLeft = "ControlLeft",
  AltLeft = "AltLeft",
  MetaLeft = "MetaLeft",
  Space = "Space",
  MetaRight = "MetaRight",
  Fn = "Fn",
  ControlRight = "ControlRight",
  ArrowLeft = "ArrowLeft",
  ArrowDown = "ArrowDown",
  ArrowRight = "ArrowRight",
  AltRight = "AltRight",
}

type KeyVariantSlot = "accent" | "dark" | "light";

interface KeyVariantDefinition {
  bg: string;
  text: string;
}

interface KeyboardThemeDefinition {
  variants: Record<KeyVariantSlot, KeyVariantDefinition>;
  keyVariantOverrides: Partial<Record<KEYCODE, KeyVariantSlot>>;
}

const DEFAULT_KEY_VARIANT_SLOT: KeyVariantSlot = "light";

const CLASSIC_DARK_KEYS: KEYCODE[] = [
  KEYCODE.F5,
  KEYCODE.F6,
  KEYCODE.F7,
  KEYCODE.F8,
  KEYCODE.F9,
  KEYCODE.F13,
  KEYCODE.Delete,
  KEYCODE.F14,
  KEYCODE.Backspace,
  KEYCODE.PageUp,
  KEYCODE.Tab,
  KEYCODE.Backslash,
  KEYCODE.PageDown,
  KEYCODE.CapsLock,
  KEYCODE.Enter,
  KEYCODE.Home,
  KEYCODE.ShiftLeft,
  KEYCODE.End,
  KEYCODE.ControlLeft,
  KEYCODE.AltLeft,
  KEYCODE.MetaLeft,
  KEYCODE.MetaRight,
  KEYCODE.Fn,
  KEYCODE.ControlRight,
];

const MINT_DARK_KEYS: KEYCODE[] = [
  KEYCODE.F5,
  KEYCODE.F6,
  KEYCODE.F7,
  KEYCODE.F8,
  KEYCODE.F9,
  KEYCODE.F13,
  KEYCODE.Delete,
  KEYCODE.F14,
  KEYCODE.Backspace,
  KEYCODE.PageUp,
  KEYCODE.Tab,
  KEYCODE.PageDown,
  KEYCODE.CapsLock,
  KEYCODE.Home,
  KEYCODE.ShiftLeft,
  KEYCODE.ShiftRight,
  KEYCODE.End,
  KEYCODE.ControlLeft,
  KEYCODE.AltLeft,
  KEYCODE.MetaLeft,
  KEYCODE.MetaRight,
  KEYCODE.Fn,
  KEYCODE.ControlRight,
];

// DEFINE YOUR CUSTOM THEMES HERE
const KEYBOARD_THEMES: Record<KeyboardThemeName, KeyboardThemeDefinition> = {
  classic: {
    variants: {
      accent: { bg: "#F57644", text: "rgba(0,0,0,0.5)" },
      dark: { bg: "#737373", text: "rgba(255,255,255,0.7)" },
      light: { bg: "#F5F5F5", text: "rgba(0,0,0,0.7)" },
    },
    keyVariantOverrides: buildKeyVariantOverrides({
      accent: [KEYCODE.Escape, KEYCODE.ShiftRight],
      dark: CLASSIC_DARK_KEYS,
    }),
  },
  mint: {
    variants: {
      accent: { bg: "#86C8AC", text: "rgba(255,255,255,0.7)" },
      dark: { bg: "#447B82", text: "rgba(255,255,255,0.7)" },
      light: { bg: "#EEEEEE", text: "#447B82" },
    },
    keyVariantOverrides: buildKeyVariantOverrides({
      accent: [
        KEYCODE.Escape,
        KEYCODE.Enter,
        KEYCODE.ArrowLeft,
        KEYCODE.ArrowRight,
        KEYCODE.ArrowUp,
        KEYCODE.ArrowDown
      ],
      dark: MINT_DARK_KEYS,
    }),
  },
  royal: {
    variants: {
      accent: { bg: "#E4D440", text: "rgba(0,0,0,0.7)" },
      dark: { bg: "#3A3B35", text: "rgba(255,255,255,0.7)" },
      light: { bg: "#324974", text: "rgba(255,255,255,0.7)" },
    },
    keyVariantOverrides: buildKeyVariantOverrides({
      accent: [
        KEYCODE.Escape,
        KEYCODE.Enter,
        KEYCODE.ArrowLeft,
        KEYCODE.ArrowRight,
        KEYCODE.ArrowUp,
        KEYCODE.ArrowDown
      ],
      dark: MINT_DARK_KEYS,
    }),
  },
  dolch: {
    variants: {
      accent: { bg: "#D73E42", text: "rgba(0,0,0,0.7)" },
      dark: { bg: "#3E3B4C", text: "rgba(255,255,255,0.7)" },
      light: { bg: "#4F5E78", text: "rgba(255,255,255,0.7)" },
    },
    keyVariantOverrides: buildKeyVariantOverrides({
      accent: [KEYCODE.Escape, KEYCODE.Enter, KEYCODE.Space],
      dark: [...MINT_DARK_KEYS, KEYCODE.Backquote, KEYCODE.Backslash],
    }),
  },
  sand: {
    variants: {
      accent: { bg: "#C94E41", text: "rgba(255,255,255,0.7)" },
      dark: { bg: "#893D36", text: "rgba(255,255,255,0.7)" },
      light: { bg: "#EFEFEF", text: "rgba(0,0,0,0.7)" },
    },
    keyVariantOverrides: buildKeyVariantOverrides({
      accent: [KEYCODE.Escape, KEYCODE.Enter],
      dark: MINT_DARK_KEYS,
    }),
  },
  scarlet: {
    variants: {
      accent: { bg: "#E1E1E1", text: "#8F4246" },
      dark: { bg: "#D5868A", text: "rgba(255,255,255,0.7)" },
      light: { bg: "#E4D7D7", text: "#8F4246" },
    },
    keyVariantOverrides: buildKeyVariantOverrides({
      accent: [KEYCODE.Escape, KEYCODE.Enter],
      dark: MINT_DARK_KEYS,
    }),
  },
};

function buildKeyVariantOverrides({
  accent = [],
  dark = [],
  light = [],
}: {
  accent?: KEYCODE[];
  dark?: KEYCODE[];
  light?: KEYCODE[];
}): Partial<Record<KEYCODE, KeyVariantSlot>> {
  const entries: Array<[KEYCODE, KeyVariantSlot]> = [];

  for (const keyCode of accent) {
    entries.push([keyCode, "accent"]);
  }
  for (const keyCode of dark) {
    entries.push([keyCode, "dark"]);
  }
  for (const keyCode of light) {
    entries.push([keyCode, "light"]);
  }

  return Object.fromEntries(entries) as Partial<Record<KEYCODE, KeyVariantSlot>>;
}

function resolveKeyVariant(
  themeName: KeyboardThemeName,
  keyCode?: KEYCODE,
): KeyVariantSlot {
  if (!keyCode) {
    return DEFAULT_KEY_VARIANT_SLOT;
  }
  return (
    KEYBOARD_THEMES[themeName].keyVariantOverrides[keyCode] ??
    DEFAULT_KEY_VARIANT_SLOT
  );
}

function toRgba(color: string, alpha: number): string {
  if (!color.startsWith("#")) {
    return color;
  }

  const value = color.slice(1);
  const hex = value.length === 3
    ? value
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : value;

  if (hex.length !== 6) {
    return color;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export const SOUND_DEFINES_DOWN: Record<string, [number, number]> = {
  Escape: [9069, 115],
  F1: [2754, 104],
  F2: [3155, 99],
  F3: [3545, 103],
  F4: [3913, 100],
  F5: [4305, 96],
  F6: [4666, 103],
  F7: [5034, 110],
  F8: [5433, 103],
  F9: [7795, 109],
  F10: [6146, 105],
  F11: [7322, 97],
  F12: [7699, 98],
  F13: [2754, 104],
  Delete: [14199, 100],
  F14: [3155, 99],
  Backquote: [9069, 115],
  Digit1: [2280, 109],
  Digit2: [9444, 102],
  Digit3: [9833, 103],
  Digit4: [10185, 107],
  Digit5: [10551, 108],
  Digit6: [10899, 107],
  Digit7: [11282, 99],
  Digit8: [11623, 103],
  Digit9: [11976, 110],
  Digit0: [12337, 108],
  Minus: [12667, 107],
  Equal: [13058, 105],
  Backspace: [13765, 101],
  PageUp: [14522, 108],
  Tab: [15916, 97],
  KeyQ: [16284, 83],
  KeyW: [16637, 97],
  KeyE: [16964, 105],
  KeyR: [17275, 102],
  KeyT: [17613, 108],
  KeyY: [17957, 95],
  KeyU: [18301, 105],
  KeyI: [18643, 110],
  KeyO: [18994, 98],
  KeyP: [19331, 108],
  BracketLeft: [19671, 94],
  BracketRight: [20020, 96],
  Backslash: [20387, 97],
  PageDown: [14852, 93],
  CapsLock: [22560, 100],
  KeyA: [22869, 109],
  KeyS: [23237, 98],
  KeyD: [23586, 103],
  KeyF: [23898, 98],
  KeyG: [24237, 102],
  KeyH: [24550, 106],
  KeyJ: [24917, 103],
  KeyK: [25274, 102],
  KeyL: [25625, 101],
  Semicolon: [25989, 100],
  Quote: [26335, 99],
  Enter: [26703, 100],
  Home: [20766, 102],
  ShiftLeft: [28109, 99],
  KeyZ: [28550, 92],
  KeyX: [28855, 101],
  KeyC: [29557, 112],
  KeyV: [29557, 112],
  KeyB: [29909, 98],
  KeyN: [30252, 112],
  KeyM: [30605, 101],
  Comma: [30965, 117],
  Period: [31315, 97],
  Slash: [31659, 96],
  ShiftRight: [28109, 99],
  ArrowUp: [32429, 96],
  End: [21409, 83],
  ControlLeft: [8036, 92],
  AltLeft: [34551, 96],
  MetaLeft: [34551, 96],
  Space: [33857, 100],
  MetaRight: [34181, 97],
  Fn: [8036, 92],
  ControlRight: [8036, 92],
  ArrowLeft: [36907, 90],
  ArrowDown: [37267, 94],
  ArrowRight: [37586, 88],
  AltRight: [35878, 90],
};

export const SOUND_DEFINES_UP: Record<string, [number, number]> = {
  Escape: [9069 + 115, 94],
  F1: [2754 + 104, 85],
  F2: [3155 + 99, 81],
  F3: [3545 + 103, 84],
  F4: [3913 + 100, 83],
  F5: [4305 + 96, 78],
  F6: [4666 + 103, 84],
  F7: [5034 + 110, 90],
  F8: [5433 + 103, 84],
  F9: [7795 + 109, 89],
  F10: [6146 + 105, 86],
  F11: [7322 + 97, 80],
  F12: [7699 + 98, 80],
  F13: [2754 + 104, 85],
  Delete: [14199 + 100, 81],
  F14: [3155 + 99, 81],
  Backquote: [9069 + 115, 94],
  Digit1: [2280 + 109, 90],
  Digit2: [9444 + 102, 83],
  Digit3: [9833 + 103, 84],
  Digit4: [10185 + 107, 87],
  Digit5: [10551 + 108, 88],
  Digit6: [10899 + 107, 87],
  Digit7: [11282 + 99, 81],
  Digit8: [11623 + 103, 85],
  Digit9: [11976 + 110, 90],
  Digit0: [12337 + 108, 89],
  Minus: [12667 + 107, 87],
  Equal: [13058 + 105, 86],
  Backspace: [13765 + 101, 83],
  PageUp: [14522 + 108, 88],
  Tab: [15916 + 97, 79],
  KeyQ: [16284 + 83, 67],
  KeyW: [16637 + 97, 79],
  KeyE: [16964 + 105, 85],
  KeyR: [17275 + 102, 83],
  KeyT: [17613 + 108, 88],
  KeyY: [17957 + 95, 78],
  KeyU: [18301 + 105, 85],
  KeyI: [18643 + 110, 90],
  KeyO: [18994 + 98, 80],
  KeyP: [19331 + 108, 89],
  BracketLeft: [19671 + 94, 77],
  BracketRight: [20020 + 96, 79],
  Backslash: [20387 + 97, 79],
  PageDown: [14852 + 93, 76],
  CapsLock: [22560 + 100, 81],
  KeyA: [22869 + 109, 89],
  KeyS: [23237 + 98, 80],
  KeyD: [23586 + 103, 84],
  KeyF: [23898 + 98, 81],
  KeyG: [24237 + 102, 83],
  KeyH: [24550 + 106, 86],
  KeyJ: [24917 + 103, 85],
  KeyK: [25274 + 102, 83],
  KeyL: [25625 + 101, 82],
  Semicolon: [25989 + 100, 82],
  Quote: [26335 + 99, 81],
  Enter: [26703 + 100, 81],
  Home: [20766 + 102, 83],
  ShiftLeft: [28109 + 99, 81],
  KeyZ: [28550 + 92, 75],
  KeyX: [28855 + 101, 83],
  KeyC: [29557 + 112, 92],
  KeyV: [29557 + 112, 92],
  KeyB: [29909 + 98, 81],
  KeyN: [30252 + 112, 91],
  KeyM: [30605 + 101, 83],
  Comma: [30965 + 117, 95],
  Period: [31315 + 97, 79],
  Slash: [31659 + 96, 79],
  ShiftRight: [28109 + 99, 81],
  ArrowUp: [32429 + 96, 78],
  End: [21409 + 83, 68],
  ControlLeft: [8036 + 92, 76],
  AltLeft: [34551 + 96, 79],
  MetaLeft: [34551 + 96, 79],
  Space: [33857 + 100, 82],
  MetaRight: [34181 + 97, 80],
  Fn: [8036 + 92, 76],
  ControlRight: [8036 + 92, 76],
  ArrowLeft: [36907 + 90, 73],
  ArrowDown: [37267 + 94, 76],
  ArrowRight: [37586 + 88, 72],
  AltRight: [35878 + 90, 74],
};
