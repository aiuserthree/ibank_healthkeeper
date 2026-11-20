const bounds = {
  sedan: { length: 2.19, width: .89 },
  wagon: { length: 2.27, width: .88 },
  van: { length: 2.45, width: 1.02 },
  gt: { length: 2.37, width: 1.08 },
};
const roadEdge = 6.65;
const limit = (value, min, max) => Math.max(min, Math.min(max, value));
const direction = vehicle => vehicle.oncoming ? -1 : 1;

export function requestYield(state) {
  let nearest = null;
  let closest = 72;
  for (const vehicle of state.traffic) {
    const gap = vehicle.z - state.distance;
    if (vehicle.oncoming || gap <= 0 || gap >= closest || Math.abs(vehicle.x - state.x) >= 1.67) continue;
    nearest = vehicle;
    closest = gap;
  }
  const rival = state.rival;
  if (rival && rival.z > state.distance && rival.z - state.distance < closest &&
      Math.abs(rival.x - state.x) < 1.67) nearest = rival;
  if (nearest && !nearest.merge) nearest.merge = { ready: state.elapsed + .19, expires: state.elapsed + 4.5, velocity: 0 };
}

function spaceInLane(vehicle, vehicles, state, lane) {
  const lookAhead = 1.45;
  const body = bounds[vehicle.shape] || bounds.sedan;
  let space = 190;
  function clearance(x, z, speed, length, width) {
    if (Math.abs(x - lane) >= body.width + width + .17) return Infinity;
    const offset = z - vehicle.z;
    const projected = offset + (speed - vehicle.speed) * lookAhead;
    if (offset * projected <= 0) return -1;
    return Math.min(Math.abs(offset), Math.abs(projected)) - body.length - length;
  }
  space = Math.min(space, clearance(state.x, state.distance, state.speed, state.car.wheelbase / 2 + .62, 1.04));
  for (const other of vehicles) {
    if (other === vehicle) continue;
    const { length, width } = bounds[other.shape] || bounds.sedan;
    const x = other.merge?.lane === lane ? lane : other.x;
    space = Math.min(space, clearance(x, other.z, other.speed, length, width));
  }
  return space;
}

function yieldSteering(vehicle, vehicles, state, dt) {
  const { merge } = vehicle;
  const { elapsed } = state;
  if (merge.through != null) {
    if (elapsed < merge.through) return 0;
    delete vehicle.merge;
    return null;
  }
  if (merge.lane == null) {
    if (elapsed > merge.expires || vehicle.z < state.distance - 3) {
      delete vehicle.merge;
      return null;
    }
    if (elapsed < merge.ready) return 0;
    const lane = LANES.indexOf(LANES.reduce((nearest, x) =>
      Math.abs(x - vehicle.x) < Math.abs(nearest - vehicle.x) ? x : nearest));
    let best = 2.1 + vehicle.speed * .07;
    for (const i of [lane + 1, lane - 1]) {
      if (i < (state.mode.twoWay ? 2 : 0) || i >= LANES.length) continue;
      const space = spaceInLane(vehicle, vehicles, state, LANES[i]);
      if (space <= best) continue;
      best = space;
      merge.lane = LANES[i];
    }
    if (merge.lane == null) return 0;
    vehicle.turnSignal = Math.sign(merge.lane - vehicle.x);
  }

  const remaining = merge.lane - vehicle.x;
  const desired = limit(remaining * 3.1, -2.95, 2.95);
  merge.velocity += (desired - merge.velocity) * -Math.expm1(-8 * dt);
  if (Math.abs(remaining) < .09 && Math.abs(merge.velocity) < .30) {
    merge.through = elapsed + 2.3;
    vehicle.turnSignal = 0;
    return remaining;
  }
  return limit(merge.velocity * dt, Math.min(0, remaining), Math.max(0, remaining));
}

export function sweptContact(fromX, toX, fromZ, toZ, width, length) {
  if (Math.min(fromX, toX) > width || Math.max(fromX, toX) < -width ||
      Math.min(fromZ, toZ) > length || Math.max(fromZ, toZ) < -length) return Infinity;
  const dx = toX - fromX, dz = toZ - fromZ;
  const enterX = Math.abs(fromX) <= width ? 0 : (Math.sign(fromX) * width - fromX) / dx;
  const enterZ = Math.abs(fromZ) <= length ? 0 : (Math.sign(fromZ) * length - fromZ) / dz;
  const time = Math.max(enterX, enterZ);
  if (!(time >= 0 && time <= 1) ||
      Math.abs(fromX + dx * time) > width + 1e-6 || Math.abs(fromZ + dz * time) > length + 1e-6) return Infinity;
  return time;
}

function follow(vehicle, vehicles, cruise, dt) {
  const dir = direction(vehicle);
  const speed = Math.abs(vehicle.lastSpeed);
  const footprint = bounds[vehicle.shape] || bounds.sedan;
  let target = cruise;
  for (const ahead of vehicles) {
    if (ahead === vehicle || direction(ahead) !== dir) continue;
    const separation = (ahead.lastZ - vehicle.lastZ) * dir;
    if (separation <= 0 || separation > 22 + speed * 1.2) continue;
    const other = bounds[ahead.shape] || bounds.sedan;
    if (Math.abs(ahead.lastX - vehicle.lastX) > footprint.width + other.width - .18) continue;
    const gap = separation - footprint.length - other.length;
    const desiredGap = 2.6 + speed * .54;
    target = Math.min(target, Math.max(0, Math.abs(ahead.lastSpeed) + (gap - desiredGap) * .94));
  }
  vehicle.braking = target < speed - .8;
  const acceleration = vehicle.rival ? 5.4 : 3.2;
  vehicle.speed = (speed + limit(target - speed, -10.5 * dt, acceleration * dt)) * dir;
}

function resolvePair(a, b, state, swept) {
  const pa = bounds[a.shape] || bounds.sedan, pb = bounds[b.shape] || bounds.sedan;
  const length = pa.length + pb.length, width = pa.width + pb.width;
  const x = b.x - a.x, z = b.z - a.z;
  const fromX = swept ? b.lastX - a.lastX : x, fromZ = swept ? b.lastZ - a.lastZ : z;
  const time = sweptContact(fromX, x, fromZ, z, width, length);
  if (!Number.isFinite(time)) return false;
  const hitX = fromX + (x - fromX) * time, hitZ = fromZ + (z - fromZ) * time;
  const sideways = width - Math.abs(hitX) < length - Math.abs(hitZ);
  const sign = Math.sign(sideways ? hitX : hitZ) || 1;
  const overlap = (sideways ? width - x * sign : length - z * sign);
  if (overlap <= 1e-6) return false;

  // Keep each car on its side of the contact plane, even if this frame crossed it completely.
  if (sideways) {
    a.x = limit(a.x - sign * overlap / 2, -roadEdge, roadEdge);
    b.x = limit(a.x + sign * width, -roadEdge, roadEdge);
    a.x = b.x - sign * width;
  } else {
    a.z -= sign * overlap / 2;
    b.z += sign * overlap / 2;
  }

  // Use the swept motion for side hits and the actual longitudinal speeds for nose-to-tail hits.
  const relative = sideways ? a.sideSpeed - b.sideSpeed : a.speed - b.speed;
  const closing = relative * sign;
  if (closing <= .05) return true;
  const impulse = closing * .55 * sign;
  if (sideways) {
    a.skid = (a.skid || 0) - impulse;
    b.skid = (b.skid || 0) + impulse;
    a.sideSpeed -= impulse;
    b.sideSpeed += impulse;
  } else {
    a.speed = Math.max(0, (a.speed - impulse) * direction(a)) * direction(a);
    b.speed = Math.max(0, (b.speed + impulse) * direction(b)) * direction(b);
    if (direction(a) !== direction(b) && Math.abs(a.skid || 0) + Math.abs(b.skid || 0) < 1) {
      const outside = Math.sign(x) || 1;
      const push = Math.min(4.7, 3.5 + closing * .22);
      a.skid = (a.skid || 0) - outside * push;
      b.skid = (b.skid || 0) + outside * push;
    }
  }
  a.braking = b.braking = true;
  if (closing < 2.2 || !swept) return true;

  const force = limit(.24 + closing / (sideways ? 13 : 39), .29, .94);
  const side = sideways ? sign : 0, front = sideways ? 0 : sign;
  a.trafficHit = { at: state.elapsed, side, front, force };
  b.trafficHit = { at: state.elapsed, side: -side, front: -front, force };
  if (Math.abs((a.z + b.z) / 2 - state.distance) < 230) {
    state.trafficImpact = {
      at: state.elapsed, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2,
      carry: (a.speed + b.speed) * .38, side, front, force, color: a.color,
    };
  }
  return true;
}

function keepPlayerContact(state, hit) {
  const { vehicle } = hit;
  const side = Math.sign(hit.front);
  const gap = side * (vehicle.z - state.distance);
  if (Math.abs(vehicle.x - state.x) > 1.81 || gap > hit.contactGap + .36) {
    hit.contactGap = 0;
  } else if (gap < hit.contactGap) vehicle.z = state.distance + side * hit.contactGap;
}

export function advanceTraffic(state, dt, rivalX) {
  const { rival, traffic, elapsed } = state;
  const vehicles = rival ? [...traffic, rival] : traffic;
  for (const vehicle of vehicles) {
    vehicle.lastX = vehicle.x;
    vehicle.lastZ = vehicle.z;
    vehicle.lastSpeed = vehicle.speed;
    vehicle.cruise ??= Math.abs(vehicle.speed);
  }
  for (const vehicle of vehicles) {
    const cruise = vehicle.rival ? 43 + 3 * Math.sin(elapsed / 4) : vehicle.cruise;
    follow(vehicle, vehicles, cruise, dt);
    const yielding = vehicle.merge ? yieldSteering(vehicle, vehicles, state, dt) : null;
    const steer = yielding ?? (vehicle.rival ? limit(rivalX - vehicle.x, -2.5 * dt, 2.5 * dt) : 0);
    vehicle.x = limit(vehicle.x + steer + (vehicle.skid || 0) * dt, -roadEdge, roadEdge);
    vehicle.sideSpeed = dt ? (vehicle.x - vehicle.lastX) / dt : 0;
    if (vehicle.skid) vehicle.skid *= Math.exp(-3.5 * dt);
    vehicle.z += (vehicle.lastSpeed + vehicle.speed) * dt / 2;
  }
  const hit = state.impact;
  const targetInTraffic = hit?.contactGap && vehicles.includes(hit.vehicle);
  if (targetInTraffic) keepPlayerContact(state, hit);

  // Resolve the swept path once, then settle any overlaps caused by a neighbouring impact.
  for (let pass = 0; pass < 7; pass++) {
    let touched = false;
    for (let i = 0; i < vehicles.length - 1; i++) {
      for (let j = i + 1; j < vehicles.length; j++) {
        if (resolvePair(vehicles[i], vehicles[j], state, pass === 0)) touched = true;
      }
    }
    if (!touched) break;
    if (targetInTraffic && hit.contactGap) keepPlayerContact(state, hit);
  }
}
export const LANES = [-5.4, -1.8, 1.8, 5.4];
