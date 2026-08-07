export function isLockerDoorOpen(locker) {
  if (!locker) return false;
  const doorOpen = locker.door_open ?? locker.locker_door_open;
  if (doorOpen !== null && doorOpen !== undefined) {
    return doorOpen === true || Number(doorOpen) === 1;
  }
  // Compatibility with status records produced by the old firmware.
  const locked = locker.locked ?? locker.locker_locked;
  return locked === false || Number(locked) === 0;
}
