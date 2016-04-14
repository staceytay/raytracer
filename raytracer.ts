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
const height = 350
const width = 350

var camera = [
  /* 0  1  2  3  4  5  6
   * px py pz vx xy xz fov */
  0, 0, 16, 0, 0, 1, 45
]

var lights = [
  /* 0  1  2
   * x  y  z */
  [-7.5, 0.5, -1.5],
  [-8.5, -0.5, -2.5],
  [-3.5, 5, 2.5],
  [-4.5, 3, 1.5],
]

var things = [
  /* 0    1           2 3 4 5        6       7       8       9  10 11 12
   * type this.length r g b specular lambert ambient opacity x  y  z  radius */
  [Thing.SPHERE, 13, 1.0, 0.0, 0.0, 0.2, 0.7, 0.1, 1.0, -2, 0, -2, 1],
  [Thing.SPHERE, 13, 0.0, 1.0, 0.0, 0.2, 0.7, 0.1, 1.0, 0, 0, 0, 1],
  [Thing.SPHERE, 13, 0.0, 0.0, 1.0, 0.2, 0.7, 0.1, 1.0, 2, 0, 2, 1],
]

let opt = (mode: string) => {
  return {
    dimensions: [width, height],
    debug: true,
    graphical: true,
    safeTextureReadHack: false,
    constants: {
      INFINITY: Number.MAX_SAFE_INTEGER,
      LIGHTSCOUNT: lights.length,
      THINGSCOUNT: things.length,
    },
    mode: mode
  }
}

let gpu = new GPU ()
let kernel = gpu.createKernel (
  function (camera: number[], lights: number[][], things: number[][],
            rays: number[][][]) {
    /*----------------------------------------------------------------
     * Helper functions for use within the kernel.
     *--------------------------------------------------------------*/
    function vectorDotProduct (V1x: number, V1y: number, V1z: number,
                               V2x: number, V2y: number, V2z: number) {
      return (V1x * V2x) + (V1y * V2y) + (V1z * V2z)
    }

    function unitVectorX (Vx: number, Vy: number, Vz: number) {
      let magnitude = (Vx * Vx) + (Vy * Vy) + (Vz * Vz)
      let div = this.constants.INFINITY
      if (magnitude > 0) div = 1.0 / magnitude
      return div * Vx
    }

    function unitVectorY (Vx: number, Vy: number, Vz: number) {
      let magnitude = (Vx * Vx) + (Vy * Vy) + (Vz * Vz)
      let div = this.constants.INFINITY
      if (magnitude > 0) div = 1.0 / magnitude
      return div * Vy
    }

    function unitVectorZ (Vx: number, Vy: number, Vz: number) {
      let magnitude = (Vx * Vx) + (Vy * Vy) + (Vz * Vz)
      let div = this.constants.INFINITY
      if (magnitude > 0) div = 1.0 / magnitude
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
    let rayVx = rays[x][y][0]
    let rayVy = rays[x][y][1]
    let rayVz = rays[x][y][2]

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
            // if (discriminant >= 0) {
            if (discriminant > 0) {
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

      }

      // 3c. Combine and set colour at point.
      let ambient = things[closest][7]
      let red = cVx + (sRed * lambertAmount * lambert) + (sRed * ambient)
      let green = cVy + (sGreen * lambertAmount * lambert) + (sGreen * ambient)
      let blue = cVz + (sBlue * lambertAmount * lambert) + (sBlue * ambient)

      this.color (red, green, blue)
    }
    else {
      // Default canvas background colour
      this.color (0.95, 0.95, 0.95)
    }
  }, opt ('gpu'))


function computeRays (camera: number[]) {
  let cameraPoint = new Vector (camera[0], camera[1], camera[2])
  let cameraVector = new Vector (camera[3], camera[4], camera[5])
  let eyeVector = Vector.norm (Vector.minus (cameraVector, cameraPoint))

  let vpRight = Vector.norm (Vector.cross (eyeVector, new Vector (0, 1, 0)))
  let vpUp = Vector.norm (Vector.cross (vpRight, eyeVector))

  let fovRadians = Math.PI * (camera[6] / 2) / 180
  let heightWidthRatio = height / width
  let halfWidth = Math.tan (fovRadians)
  let halfHeight = heightWidthRatio * halfWidth
  let camerawidth = halfWidth * 2
  let cameraheight = halfHeight * 2
  let pixelWidth = camerawidth / (width - 1)
  let pixelHeight = cameraheight / (height - 1)

  var rays = []
  for (var x = 0; x < width; x++) {
    rays.push ([])
    for (var y = 0; y < height; y++) {
      let xcomp = Vector.times ((x * pixelWidth) - halfWidth, vpRight)
      let ycomp = Vector.times ((y * pixelHeight) - halfHeight, vpUp)

      let ray = Vector.norm (Vector.plus (Vector.plus (eyeVector, xcomp), ycomp));
      rays[x].push (ray.toArray ())
    }
  }

  return rays
}

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

let f = document.getElementById('fps')
let rays = computeRays (camera)
function renderLoop () {
  f.innerHTML = fps.getFPS ().toString ()
  kernel (camera, lights, things, rays)

  let canvas = kernel.getCanvas ()
  let cv = document.getElementsByTagName('canvas')[0]
  cv.parentNode.replaceChild (canvas, cv)

  things.forEach (function (thing) {
    thing[10] = (thing[10] + 0.1) % 10
  })

  requestAnimationFrame (renderLoop)
}
window.onload = renderLoop;
