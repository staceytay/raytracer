/// <reference path="vendor/gpu.d.ts" />

class Vector {
  constructor (public x: number, public y: number, public z: number) {}

  public toArray () {
    return [this.x, this.y, this.z]
  }

  static times (k: number, v: Vector) {
    return new Vector (k * v.x, k * v.y, k * v.z)
  }
  static minus (v1: Vector, v2: Vector) {
    return new Vector (v1.x - v2.x, v1.y - v2.y, v1.z - v2.z)
  }
  static plus (v1: Vector, v2: Vector) {
    return new Vector (v1.x + v2.x, v1.y + v2.y, v1.z + v2.z)
  }
  static dot (v1: Vector, v2: Vector) {
    return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z
  }
  static magnitude (v: Vector) {
    return Math.sqrt (v.x * v.x + v.y * v.y + v.z * v.z)
  }
  static norm (v: Vector) {
    var mag = Vector.magnitude (v)
    var div = (mag === 0) ? Infinity : 1.0 / mag
    return Vector.times (div, v)
  }
  static cross (v1: Vector, v2: Vector) {
    return new Vector (v1.y * v2.z - v1.z * v2.y,
                       v1.z * v2.x - v1.x * v2.z,
                       v1.x * v2.y - v1.y * v2.x)
  }
}

const enum Mode { GPU, CPU }
const enum Thing { SPHERE, }
const height = 600
const width = height

var camera = [
  /* 0  1  2  3  4  5  6
   * px py pz vx xy xz fov */
  0, 0, 16, 0, 0, 1, 45
]

var lights = [
  /* 0  1  2
   * x  y  z */
  [-16, 16, 8],
  [16, 16, 8],
]

var things = [
  /* 0    1           2 3 4 5        6       7       8       9  10 11 12
   * type this.length r g b specular lambert ambient opacity x  y  z  radius */
  [Thing.SPHERE, 13,
   1.0, 0.0, 0.0,
   0.3, 0.7, 0.2, 1.0,
   -2, 0, -2, 1],
  [Thing.SPHERE, 13,
   0.0, 1.0, 0.0,
   0.3, 0.7, 0.2, 1.0,
   0, 0, 0, 1],
  [Thing.SPHERE, 13,
   0.0, 0.0, 1.0,
   0.3, 0.7, 0.2, 1.0,
   2, 0, 2, 1],
]

let constants = {
  INFINITY: Number.MAX_SAFE_INTEGER,
  LIGHTSCOUNT: lights.length,
  THINGSCOUNT: things.length,
}

let opt = (mode: string) => {
  return {
    constants: constants,
    debug: true,
    dimensions: [width, height],
    graphical: true,
    mode: mode,
    safeTextureReadHack: false,
  }
}

let gpu = new GPU ()
/*----------------------------------------------------------------
 * Helper functions for use within the kernel.
 *--------------------------------------------------------------*/
function vectorDotProduct (V1x: number, V1y: number, V1z: number,
                           V2x: number, V2y: number, V2z: number) {
  return (V1x * V2x) + (V1y * V2y) + (V1z * V2z)
}
function unitVectorX (Vx: number, Vy: number, Vz: number) {
  let magnitude = Math.sqrt ((Vx * Vx) + (Vy * Vy) + (Vz * Vz))
  let div = 1.0 / magnitude
  return div * Vx
}
function unitVectorY (Vx: number, Vy: number, Vz: number) {
  let magnitude = Math.sqrt ((Vx * Vx) + (Vy * Vy) + (Vz * Vz))
  let div = 1.0 / magnitude
  return div * Vy
}
function unitVectorZ (Vx: number, Vy: number, Vz: number) {
  let magnitude = Math.sqrt ((Vx * Vx) + (Vy * Vy) + (Vz * Vz))
  let div = 1.0 / magnitude
  return div * Vz
}
function sphereNormalX (Sx: number, Sy: number, Sz: number, radius: number,
                        Px: number, Py: number, Pz: number) {
  let SPx = Px - Sx
  let SPy = Py - Sy
  let SPz = Pz - Sz

  let magnitude = (SPx * SPx) + (SPy * SPy) + (SPz * SPz)
  let div = this.constants.INFINITY
  if (magnitude > 0) div = 1.0 / magnitude
  return div * SPx
}
function sphereNormalY (Sx: number, Sy: number, Sz: number, radius: number,
                        Px: number, Py: number, Pz: number) {
  let SPx = Px - Sx
  let SPy = Py - Sy
  let SPz = Pz - Sz

  let magnitude = (SPx * SPx) + (SPy * SPy) + (SPz * SPz)
  let div = this.constants.INFINITY
  if (magnitude > 0) div = 1.0 / magnitude
  return div * SPy
}
function sphereNormalZ (Sx: number, Sy: number, Sz: number, radius: number,
                        Px: number, Py: number, Pz: number) {
  let SPx = Px - Sx
  let SPy = Py - Sy
  let SPz = Pz - Sz

  let magnitude = (SPx * SPx) + (SPy * SPy) + (SPz * SPz)
  let div = this.constants.INFINITY
  if (magnitude > 0) div = 1.0 / magnitude
  return div * SPz
}
function vectorReflectX (Vx: number, Vy: number, Vz: number,
                         Nx: number, Ny: number, Nz: number) {
  let V1x = ((Vx * Nx) + (Vy * Ny) + (Vz * Nz)) * Nx
  return (V1x * 2) - Vx
}
function vectorReflectY (Vx: number, Vy: number, Vz: number,
                         Nx: number, Ny: number, Nz: number) {
  let V1y = ((Vx * Nx) + (Vy * Ny) + (Vz * Nz)) * Ny
  return (V1y * 2) - Vy
}
function vectorReflectZ (Vx: number, Vy: number, Vz: number,
                         Nx: number, Ny: number, Nz: number) {
  let V1z = ((Vx * Nx) + (Vy * Ny) + (Vz * Nz)) * Nz
  return (V1z * 2) - Vz
}
// Find the distance from the camera point to the sphere for a ray.
// If the ray does not intersect the sphere, return INFINITY.
// A ray R (with origin at E and direction V) intersecting
// a sphere, with center at O and radius r, at point P.
// v = dot_product (EO, V)
// discriminant = r^2 - (dot_product (EO, EO) - v^2)
// if (disc < 0)
//   no intersection
// else
//   d = sqrt (discriminant)
//   P = E + (v - d) * V
// Formula from https://www.cs.unc.edu/~rademach/xroads-RT/RTarticle.html
function sphereIntersectionDistance (Sx: number, Sy: number, Sz: number,
                                     radius: number,
                                     Ex: number, Ey: number, Ez: number,
                                     Vx: number, Vy: number, Vz: number) {
  let EOx = Sx - Ex
  let EOy = Sy - Ey
  let EOz = Sz - Ez
  let v = (EOx * Vx) + (EOy * Vy) + (EOz * Vz)
  let discriminant = (radius * radius)
    - ((EOx * EOx) + (EOy * EOy) + (EOz * EOz))
    + (v * v)
  if (discriminant < 0) {
    return this.constants.INFINITY
  }
  else {
    // Length of EP.
    return v - Math.sqrt (discriminant)
  }
}

let kernelFunctions = [
  vectorDotProduct,
  unitVectorX, unitVectorY, unitVectorZ,
  sphereNormalX, sphereNormalY, sphereNormalZ,
  vectorReflectX, vectorReflectY, vectorReflectZ,
  sphereIntersectionDistance
]

kernelFunctions.forEach(f => gpu.addFunction(f))

let kernel = gpu.createKernel (
  function (camera: number[], lights: number[][], things: number[][],
            eyeV: number[], rightV: number[], upV: number[],
            halfHeight: number, halfWidth: number,
            pixelHeight: number, pixelWidth: number) {
    /*----------------------------------------------------------------
     * Trace.
     *--------------------------------------------------------------*/
    // 1. Get ray that hits this point on the canvas. A ray consists of
    //    its point, P and vector, V.
    let x = this.thread.x
    let y = this.thread.y

    let rayPx = camera[0]
    let rayPy = camera[1]
    let rayPz = camera[2]

    let xCompVx = ((x * pixelWidth) - halfWidth) * rightV[0]
    let xCompVy = ((x * pixelWidth) - halfWidth) * rightV[1]
    let xCompVz = ((x * pixelWidth) - halfWidth) * rightV[2]

    let yCompVx = ((y * pixelHeight) - halfHeight) * upV[0]
    let yCompVy = ((y * pixelHeight) - halfHeight) * upV[1]
    let yCompVz = ((y * pixelHeight) - halfHeight) * upV[2]

    let sumVx = eyeV[0] + xCompVx + yCompVx
    let sumVy = eyeV[1] + xCompVy + yCompVy
    let sumVz = eyeV[2] + xCompVz + yCompVz

    let rayVx = unitVectorX (sumVx, sumVy, sumVz)
    let rayVy = unitVectorY (sumVx, sumVy, sumVz)
    let rayVz = unitVectorZ (sumVx, sumVy, sumVz)

    // 2. Get first intersection, if any.
    var closest = this.constants.THINGSCOUNT
    var closestDistance = this.constants.INFINITY
    for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
      let distance = sphereIntersectionDistance (
        things[i][9], things[i][10], things[i][11], things[i][12],
        rayPx, rayPy, rayPz, rayVx, rayVy, rayVz
      )
      if (distance < closestDistance) {
        closest = i
        closestDistance = distance
      }
    }

    // 3. If the ray intersects an object, find its colour.
    if (closestDistance < this.constants.INFINITY) {
      // Find point of intersection, P.
      let px = rayPx + rayVx * closestDistance
      let py = rayPy + rayVy * closestDistance
      let pz = rayPz + rayVz * closestDistance

      // Find sphere normal.
      let sx = things[closest][9]
      let sy = things[closest][10]
      let sz = things[closest][11]
      let sRadius = things[closest][12]
      let snVx = sphereNormalX (sx, sy, sz, sRadius, px, py, pz)
      let snVy = sphereNormalY (sx, sy, sz, sRadius, px, py, pz)
      let snVz = sphereNormalZ (sx, sy, sz, sRadius, px, py, pz)

      // Sphere colour and lambertian reflectance.
      let sRed = things[closest][2]
      let sGreen = things[closest][3]
      let sBlue = things[closest][4]
      let ambient = things[closest][7]
      let lambert = things[closest][6]

      // 3a. Compute Lambert shading.
      let lambertAmount = 0
      if (lambert > 0) {
        for (var i = 0; i < this.constants.LIGHTSCOUNT; i++) {
          // Check is if light is visible on this point.
          let LPx =  px - lights[i][0]
          let LPy = py - lights[i][1]
          let LPz = pz - lights[i][2]
          let uLPx = unitVectorX (LPx, LPy, LPz)
          let uLPy = unitVectorY (LPx, LPy, LPz)
          let uLPz = unitVectorZ (LPx, LPy, LPz)

          // var closest = this.constants.THINGSCOUNT
          var closestDistance = this.constants.INFINITY
          for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
            // Find sphere intersection distance from light source
            let distance = this.constants.INFINITY
            let EOx = things[i][9] - px
            let EOy = things[i][10] - py
            let EOz = things[i][11] - pz
            let v = (EOx * uLPx) + (EOy * uLPy) + (EOz * uLPz)
            let radius = things[i][12]
            let discriminant = (radius * radius)
              - ((EOx * EOx) + (EOy * EOy) + (EOz * EOz))
              + (v * v)
            if (discriminant >= 0) {
              // Length of EP.
              distance = v - Math.sqrt (discriminant)
            }

            if (distance < closestDistance) {
              // closest = i
              closestDistance = distance
            }
          }

          // If isLighted.
          if (closestDistance > -0.005) {
            let PLx = -LPx
            let PLy = -LPy
            let PLz = -LPz

            let uPLx = unitVectorX (PLx, PLy, PLz)
            let uPLy = unitVectorY (PLx, PLy, PLz)
            let uPLz = unitVectorZ (PLx, PLy, PLz)

            let contribution = vectorDotProduct (uPLx, uPLy, uPLz,
                                                 snVx, snVy, snVz)

            if (contribution > 0) lambertAmount += contribution
          }
        }
      }
      lambertAmount = Math.min(1, lambertAmount)

      // 3b. Compute specular reflection.
      let specular = things[closest][5]
      let cVx = 0
      let cVy = 0
      let cVz = 0
      if (specular > 0) {
        // Reflect ray on sphere.
        let rRayPx = px
        let rRayPy = py
        let rRayPz = pz
        let rRayVx = vectorReflectX (rayVx, rayVy, rayVz, snVx, snVy, snVz)
        let rRayVy = vectorReflectY (rayVx, rayVy, rayVz, snVx, snVy, snVz)
        let rRayVz = vectorReflectZ (rayVx, rayVy, rayVz, snVx, snVy, snVz)

        // Trace, again, to calculate reflection colour.
        // Get first intersection, if any.
        var closest = this.constants.THINGSCOUNT
        var closestDistance = this.constants.INFINITY
        for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
          let distance = sphereIntersectionDistance (
            things[i][9], things[i][10], things[i][11], things[i][12],
            rRayPx, rRayPy, rRayPz, rRayVx, rRayVy, rRayVz
          )
          if (distance < closestDistance) {
            closest = i
            closestDistance = distance
          }
        }

        // Set white as the default color for rays that don't hit anything.
        let reflectedRed = 1
        let reflectedGreen = 1
        let reflectedBlue = 1
        if (closestDistance < this.constants.INFINITY) {
          // Find point of intersection, P'.
          let px = rRayPx + rRayVx * closestDistance
          let py = rRayPy + rRayVy * closestDistance
          let pz = rRayPz + rRayVz * closestDistance

          /*----------------------------------------------------------
           * Verbatim from above, except for prefixing of some
           * variables with an r.
           *--------------------------------------------------------*/
          // Find sphere normal.
          let sx = things[closest][9]
          let sy = things[closest][10]
          let sz = things[closest][11]
          let sRadius = things[closest][12]
          let snVx = sphereNormalX (sx, sy, sz, sRadius, px, py, pz)
          let snVy = sphereNormalY (sx, sy, sz, sRadius, px, py, pz)
          let snVz = sphereNormalZ (sx, sy, sz, sRadius, px, py, pz)

          // Sphere colour and lambertian reflectance.
          let rsRed = things[closest][2]
          let rsGreen = things[closest][3]
          let rsBlue = things[closest][4]
          let rambient = things[closest][7]
          let rlambert = things[closest][6]

          // 3a. Compute Lambert shading.
          let rlambertAmount = 0
          if (rlambert > 0) {
            for (var i = 0; i < this.constants.LIGHTSCOUNT; i++) {
              // Check is if light is visible on this point.
              let LPx =  px - lights[i][0]
              let LPy = py - lights[i][1]
              let LPz = pz - lights[i][2]
              let uLPx = unitVectorX (LPx, LPy, LPz)
              let uLPy = unitVectorY (LPx, LPy, LPz)
              let uLPz = unitVectorZ (LPx, LPy, LPz)

              var closest = this.constants.THINGSCOUNT
              var closestDistance = this.constants.INFINITY
              for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
                // Find sphere intersection distance from light source
                let distance = this.constants.INFINITY
                let EOx = things[i][9] - px
                let EOy = things[i][10] - py
                let EOz = things[i][11] - pz
                let v = (EOx * uLPx) + (EOy * uLPy) + (EOz * uLPz)
                let radius = things[i][12]
                let discriminant = (radius * radius)
                  - ((EOx * EOx) + (EOy * EOy) + (EOz * EOz))
                  + (v * v)
                if (discriminant >= 0) {
                  // Length of EP.
                  distance = v - Math.sqrt (discriminant)
                }

                if (distance < closestDistance) {
                  closest = i
                  closestDistance = distance
                }
              }

              // If isLighted.
              if (closestDistance > -0.005) {
                let PLx = -LPx
                let PLy = -LPy
                let PLz = -LPz

                let uPLx = unitVectorX (PLx, PLy, PLz)
                let uPLy = unitVectorY (PLx, PLy, PLz)
                let uPLz = unitVectorZ (PLx, PLy, PLz)

                let contribution = vectorDotProduct (uPLx, uPLy, uPLz,
                                                     snVx, snVy, snVz)

                if (contribution > 0) rlambertAmount += contribution
              }
            }
          }
          rlambertAmount = Math.min(1, rlambertAmount)
          /*----------------------------------------------------------
           * End verbatim.
           *--------------------------------------------------------*/
          // This time, compute colours without specular.
          reflectedRed = (rsRed * rlambertAmount * rlambert) + (rsRed * rambient)
          reflectedGreen = (rsGreen * rlambertAmount * rlambert) + (rsGreen * rambient)
          reflectedBlue = (rsBlue * rlambertAmount * rlambert) + (rsBlue * rambient)
          // End trace for specular.

          // Combine reflected colour.
          cVx = cVx + (specular * reflectedRed)
          cVy = cVy + (specular * reflectedGreen)
          cVz = cVz + (specular * reflectedBlue)
        }
      }

      // 3c. Combine and set colour at point.
      let red = cVx + (sRed * lambertAmount * lambert) + (sRed * ambient)
      let green = cVy + (sGreen * lambertAmount * lambert) + (sGreen * ambient)
      let blue = cVz + (sBlue * lambertAmount * lambert) + (sBlue * ambient)

      this.color (red, green, blue)
    }
    else {
      // Default canvas background colour
      this.color (0.95, 0.95, 0.95)
    }
  }, opt ('cpu'))


let canvas = kernel.getCanvas ()
document.getElementById('container').appendChild(canvas);

var fps = {
  startTime: 0,
  frameNumber: 0,
  getFPS: function () {
    this.frameNumber++;
    let d = new Date ().getTime ()
    let currentTime = (d - this.startTime) / 1000
    let result = Math.floor (this.frameNumber / currentTime)

    if (currentTime > 1) {
      this.startTime = new Date ().getTime ()
      this.frameNumber = 0
    }
    return result;
  }
}

let cameraPoint = new Vector (camera[0], camera[1], camera[2])
let cameraVector = new Vector (camera[3], camera[4], camera[5])
let eyeVector = Vector.norm (Vector.minus (cameraVector, cameraPoint))

let vpRight = Vector.norm (Vector.cross (eyeVector, new Vector (0, 1, 0)))
let vpUp = Vector.norm (Vector.cross (vpRight, eyeVector))

let fovRadians = Math.PI * (camera[6] / 2) / 180
let heightWidthRatio = height / width
let halfWidth = Math.tan (fovRadians)
let halfHeight = heightWidthRatio * halfWidth
let cameraWidth = halfWidth * 2
let cameraHeight = halfHeight * 2
let pixelWidth = cameraWidth / (width - 1)
let pixelHeight = cameraHeight / (height - 1)

let f = document.getElementById('fps')
function renderLoop () {
  f.innerHTML = fps.getFPS ().toString ()
  kernel (camera, lights, things,
          eyeVector.toArray (), vpRight.toArray (), vpUp.toArray (),
          halfHeight, halfWidth, pixelHeight, pixelWidth)

  let canvas = kernel.getCanvas ()
  let cv = document.getElementsByTagName('canvas')[0]
  cv.parentNode.replaceChild (canvas, cv)

  things.forEach (function (thing) {
    let height = this.height / (halfHeight * 2 * 100)
    if (thing[10] < height)
      thing[10] = (thing[10] + 0.02) % (height + 1)
    else
      thing[10] = -1 * height
  })

  requestAnimationFrame (renderLoop)
}
window.onload = renderLoop;
