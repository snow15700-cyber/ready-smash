/* 경기 전 연출(src/ui/intro.js)에서 쓰는 '탁구채를 몸 옆에 든 자세'.
   (예전 대기실 무대·연습 스윙은 광장 탁구대로 바뀌면서 없앴다, plaza.md ②) */
// 몸 옆에 든 자세 + 한 번 휘두르기 (c.stSwing부터: 뒤로 빼기 → 휘두르기 → 제자리, 블록은 툭 내밀기)
export function holdPose(c, now, i) {
  let yaw = -0.25 + Math.sin(now * 1.7 + i) * 0.05, pitch = -0.15, twist = 0;
  const st = now - (c.stSwing ?? -9);
  if (st < 0.5) {
    if (c.stBlock) {
      const k = Math.sin(Math.min(1, st / 0.25) * Math.PI);
      yaw += 0.35 * k;
      pitch += 0.15 * k;
    } else {
      let a;
      if (st < 0.07) a = (-st / 0.07) * 0.6;
      else if (st < 0.2) { const u = (st - 0.07) / 0.13; a = -0.6 + 1.9 * (1 - (1 - u) * (1 - u)); }
      else { const u = (st - 0.2) / 0.3; a = 1.3 * (1 - u * u * (3 - 2 * u)); }
      yaw += a;
      pitch += Math.max(0, a) * 0.45;
      twist = a * 0.22;
    }
  }
  c.arm.rotation.set(pitch, yaw, 0.12);
  c.body.rotation.set(0, twist, 0);
}
