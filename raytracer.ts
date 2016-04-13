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
  0, 0, 0, 1, 1, 1, 165
]

var lights = [
  /* 0  1  2
   * x  y  z */
  [200, 200, 200],
  [100, 100, 100]
]

var things = [
  /* 0    1           2 3 4 5        6       7       8       9  10 11 12
   * type this.length r g b specular lambert ambient opacity x  y  z  radius */
  [Thing.SPHERE, 13, 0.0, 1.0, 0.0, 0.2, 0.7, 0.1, 1.0, 100, 500, 500, 100],
  [Thing.SPHERE, 13, 0.0, 0.0, 1.0, 0.2, 0.7, 0.1, 1.0, -8, 0, 2, 1],
  [Thing.SPHERE, 13, 1.0, 0.0, 0.0, 0.2, 0.7, 0.1, 1.0, -4, 3.5, -2, 0.5],
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
    // // This function checks if a point on an object in the scene is lighted
    // function isLighted (light: number, p1: number, p2: number, p3: number) {
    //   let V = [
    //     p1 - lights[light][0],
    //     p2 - lights[light][1],
    //     p3 - lights[light][2]
    //   ]
    //   let magnitude = Math.sqrt (V[0] * V[0] + V[1] * V[1] + V[2] * V[2])
    //   let div = (magnitude === 0) ? this.constants.INFINITY : 1.0 / magnitude
    //   V = [
    //     div * V[0],
    //     div * V[1],
    //     div * V[2]
    //   ]

    //   var closest = this.constants.THINGSCOUNT
    //   var closestDistance = this.constants.INFINITY
    //   for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
    //     // let distance = sphereIntersectionDistance (i, V1, V2, V3)
    //     let distance = this.constants.INFINITY
    //     let EO1 = things[i][9] - p1
    //     let EO2 = things[i][10] - p2
    //     let EO3 = things[i][11] - p3
    //     let v = (EO1 * V[0]) + (EO2 * V[1]) + (EO3 * V[2])
    //     let radius = things[i][12]
    //     let discriminant = (radius * radius)
    //       - ((EO1 * EO1) + (EO2 * EO2) + (EO3 * EO3))
    //       + (v * v)
    //     if (discriminant >= 0) {
    //       // Length of EP.
    //       distance = v - Math.sqrt (discriminant)
    //     }

    //     if (distance < closestDistance) {
    //       closest = i
    //       closestDistance = distance
    //     }
    //   }

    //   return closestDistance > -0.005
    // }

    /*----------------------------------------------------------------
     * Trace.
     *--------------------------------------------------------------*/
    // 1. Get ray that hits this point on the canvas.
    let x = this.thread.x
    let y = this.thread.y

    let rayX = rays[x][y][0]
    let rayY = rays[x][y][1]
    let rayZ = rays[x][y][2]

    // 2. Get first intersection, if any.
    var closest = this.constants.THINGSCOUNT
    var closestDistance = this.constants.INFINITY
    for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
      let distance = sphereIntersectionDistance (
        things[i][9], things[i][10], things[i][11], things[i][12],
        camera[0], camera[1], camera[2], rayX, rayY, rayZ
      )
      if (distance < closestDistance) {
        closest = i
        closestDistance = distance
      }
    }

    // 3. If the ray intersects an object, find its colour
    if (closestDistance < this.constants.INFINITY) {
      this.color (things[closest][2], things[closest][3], things[closest][4])
      // // Scale ray vector
      // v1 = closestDistance * v1
      // v2 = closestDistance * v2
      // v3 = closestDistance * v3
      // // Find point of intersection, P
      // let p1 = camera[0] + v1 * closestDistance
      // let p2 = camera[1] + v2 * closestDistance
      // let p3 = camera[2] + v3 * closestDistance

      // let lambert = 0
      // // Compute Lambert shading.
      // if (things[closest][6] > 0) {
      //   for (var i = 0; i < this.constants.LIGHTSCOUNT; i++) {
      //     if (isLighted (i, p1, p2, p3)) {

      //       var contribution =
      //         Vector.dotProduct(
      //           Vector.unitVector(
      //             Vector.subtract(
      //               lightPoint,
      //               pointAtTime)
      //           ),
      //           normal)



      //       if (contribution > 0) lambertAmount += contribution;
      //     }
      //   }
      // }
    }
    else {
      // Default canvas background colour
      this.color (0.95, 0.95, 0.95)
    }
  }, opt ('gpu'))


function render (camera: number[], lights: number[][], things: number[][]) {
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

  kernel (camera, lights, things, rays)
  let canvas = kernel.getCanvas ();
  document.getElementsByTagName('body')[0].appendChild(canvas);
}

render (camera, lights, things)
