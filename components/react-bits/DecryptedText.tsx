"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { mulberry32 } from "@/lib/rng";

interface DecryptedTextProps {
  text: string;
  /** ms between scramble frames. */
  speed?: number;
  /** Frames before every character is revealed. */
  maxIterations?: number;
  characters?: string;
  className?: string;
  encryptedClassName?: string;
  animateOn?: "mount" | "view" | "hover";
  /** Seeded so the scramble is identical every run (no Math.random). */
  seed?: number;
}

export default function DecryptedText({
  text,
  speed = 40,
  maxIterations = 12,
  characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*",
  className = "",
  encryptedClassName = "text-[#00F0FF]/60",
  animateOn = "mount",
  seed = 1027,
}: DecryptedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(text);
  const [revealed, setRevealed] = useState(text.length);
  const [hovering, setHovering] = useState(false);

  const active = animateOn === "mount" || (animateOn === "view" && inView) || (animateOn === "hover" && hovering);

  const still = reduced || !active;

  useEffect(() => {
    if (still) return;
    const rng = mulberry32(seed);
    let frame = 0;
    const id = setInterval(() => {
      frame++;
      const keep = Math.floor((frame / maxIterations) * text.length);
      setRevealed(keep);
      setDisplay(
        text
          .split("")
          .map((ch, i) => (i < keep || ch === " " ? ch : characters[Math.floor(rng() * characters.length)]))
          .join(""),
      );
      if (frame >= maxIterations) {
        clearInterval(id);
        setDisplay(text);
        setRevealed(text.length);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, still, speed, maxIterations, characters, seed]);

  return (
    <span
      ref={ref}
      className="inline-block whitespace-pre-wrap"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {(still ? text : display).split("").map((ch, i) => (
          <span key={i} className={still || i < revealed ? className : encryptedClassName}>
            {ch}
          </span>
        ))}
      </span>
    </span>
  );
}
