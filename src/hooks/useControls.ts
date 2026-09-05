import { useEffect, useRef, useCallback } from 'react';

interface JoystickState {
  active: boolean;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

export function useKeyboardControls() {
  const keys = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        keys.current.add(key);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const getMovement = useCallback(() => {
    const k = keys.current;
    let x = 0;
    let z = 0;
    if (k.has('w') || k.has('arrowup')) z -= 1;
    if (k.has('s') || k.has('arrowdown')) z += 1;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;

    const len = Math.sqrt(x * x + z * z);
    if (len > 0) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }, []);

  return { getMovement };
}

export function useTouchControls(
  joystickRef: React.RefObject<HTMLDivElement | null>,
  onMove: (x: number, z: number) => void
) {
  const joystickState = useRef<JoystickState>({
    active: false,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
  });

  useEffect(() => {
    const el = joystickRef.current;
    if (!el) return;

    const handleStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = el.getBoundingClientRect();
      joystickState.current = {
        active: true,
        originX: rect.left + rect.width / 2,
        originY: rect.top + rect.height / 2,
        currentX: touch.clientX,
        currentY: touch.clientY,
      };
    };

    const handleMove = (e: TouchEvent) => {
      if (!joystickState.current.active) return;
      e.preventDefault();
      const touch = e.touches[0];
      joystickState.current.currentX = touch.clientX;
      joystickState.current.currentY = touch.clientY;

      const dx = touch.clientX - joystickState.current.originX;
      const dy = touch.clientY - joystickState.current.originY;
      const maxDist = 40;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clampedDist = Math.min(dist, maxDist);
      const angle = Math.atan2(dy, dx);

      const nx = (Math.cos(angle) * clampedDist) / maxDist;
      const ny = (Math.sin(angle) * clampedDist) / maxDist;

      // Map to 3D: x is left/right, z is forward/back (negative y in 2D is forward)
      onMove(nx, ny);
    };

    const handleEnd = (e: TouchEvent) => {
      e.preventDefault();
      joystickState.current.active = false;
      onMove(0, 0);
    };

    el.addEventListener('touchstart', handleStart, { passive: false });
    el.addEventListener('touchmove', handleMove, { passive: false });
    el.addEventListener('touchend', handleEnd, { passive: false });
    el.addEventListener('touchcancel', handleEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleStart);
      el.removeEventListener('touchmove', handleMove);
      el.removeEventListener('touchend', handleEnd);
      el.removeEventListener('touchcancel', handleEnd);
    };
  }, [joystickRef, onMove]);

  return joystickState;
}

export function useCameraControls() {
  const mouseRef = useRef({ x: 0, y: 0, isDown: false });
  const rotationRef = useRef({ x: -0.3, y: 0 });

  useEffect(() => {
    const handleMouseDown = () => {
      mouseRef.current.isDown = true;
    };
    const handleMouseUp = () => {
      mouseRef.current.isDown = false;
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseRef.current.isDown) return;
      rotationRef.current.y -= e.movementX * 0.003;
      rotationRef.current.x -= e.movementY * 0.003;
      rotationRef.current.x = Math.max(-0.8, Math.min(0.3, rotationRef.current.x));
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const getRotation = useCallback(() => {
    return { ...rotationRef.current };
  }, []);

  return { mouseRef, rotationRef, getRotation };
}
