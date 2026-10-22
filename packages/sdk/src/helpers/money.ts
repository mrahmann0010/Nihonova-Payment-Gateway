/* --------------------------------------------------------------------------
   Taka ⇄ poisha. The gateway's wire is taka; the SDK's API is integer poisha.

   Rounded, not truncated: 12.34 taka arrives as 12.339999…, and truncating
   would make a correct payment one poisha short of its order.
   -------------------------------------------------------------------------- */

export function takaToPoisha(taka: number): number {
  return Math.round(taka * 100);
}

export function poishaToTaka(poisha: number): number {
  return poisha / 100;
}
