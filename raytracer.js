/// <reference path="vendor/gpu.d.ts" />
var Vector = (function () {
    function Vector(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    Vector.prototype.toArray = function () {
        return [this.x, this.y, this.z];
    };
    Vector.times = function (k, v) {
        return new Vector(k * v.x, k * v.y, k * v.z);
    };
    Vector.minus = function (v1, v2) {
        return new Vector(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z);
    };
    Vector.plus = function (v1, v2) {
        return new Vector(v1.x + v2.x, v1.y + v2.y, v1.z + v2.z);
    };
    Vector.dot = function (v1, v2) {
        return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    };
    Vector.magnitude = function (v) {
        return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    };
    Vector.norm = function (v) {
        var mag = Vector.magnitude(v);
        var div = (mag === 0) ? Infinity : 1.0 / mag;
        return Vector.times(div, v);
    };
    Vector.cross = function (v1, v2) {
        return new Vector(v1.y * v2.z - v1.z * v2.y, v1.z * v2.x - v1.x * v2.z, v1.x * v2.y - v1.y * v2.x);
    };
    return Vector;
}());
var height = 352;
var width = height;
var camera = [
    /* 0  1  2  3  4  5  6
     * px py pz vx xy xz fov */
    0, 0, 16, 0, 0, 1, 45
];
// var camera = [
//   /* 0  1  2  3  4  5  6
//    * px py pz vx xy xz fov */
//   10, 22, 0, 1, 2, 3, 90
// ]
var lights = [
    /* 0  1  2
     * x  y  z */
    // [-5, 5, 5]
    // [101, 501, 501],
    // [99, 499, 499],
    // [3,3,3],
    [1, 2, 2],
    // [-6.5, 0.5, -1.5],
    // [-7.5, 0.5, -1.5],
    // [-8.5, -0.5, -2.5],
    // [-10, 0, 0],
    [-3, 5, 2],
];
var things = [
    /* 0    1           2 3 4 5        6       7       8       9  10 11 12
     * type this.length r g b specular lambert ambient opacity x  y  z  radius */
    // [Thing.SPHERE, 13, 0.0, 1.0, 0.0, 0.2, 0.7, 0.1, 1.0, 100, 500, 500, 100],
    [0 /* SPHERE */, 13, 1.0, 0.0, 0.0, 0.2, 0.7, 0.1, 1.0, -2, 0, -2, 1],
    [0 /* SPHERE */, 13, 0.0, 1.0, 0.0, 0.2, 0.7, 0.1, 1.0, 0, 0, 0, 1],
    [0 /* SPHERE */, 13, 0.0, 0.0, 1.0, 0.2, 0.7, 0.1, 1.0, 2, 0, 2, 1],
];
var opt = function (mode) {
    return {
        dimensions: [width, height],
        debug: true,
        graphical: true,
        safeTextureReadHack: false,
        constants: {
            INFINITY: Number.MAX_SAFE_INTEGER,
            LIGHTSCOUNT: lights.length,
            THINGSCOUNT: things.length
        },
        mode: mode
    };
};
var gpu = new GPU();
var kernel = gpu.createKernel(function (camera, lights, things, rays) {
    /*----------------------------------------------------------------
     * Helper functions for use within the kernel.
     *--------------------------------------------------------------*/
    function vectorDotProduct(V1x, V1y, V1z, V2x, V2y, V2z) {
        return (V1x * V2x) + (V1y * V2y) + (V1z * V2z);
    }
    function unitVectorX(Vx, Vy, Vz) {
        var magnitude = (Vx * Vx) + (Vy * Vy) + (Vz * Vz);
        var div = this.constants.INFINITY;
        if (magnitude > 0)
            div = 1.0 / magnitude;
        return div * Vx;
    }
    function unitVectorY(Vx, Vy, Vz) {
        var magnitude = (Vx * Vx) + (Vy * Vy) + (Vz * Vz);
        var div = this.constants.INFINITY;
        if (magnitude > 0)
            div = 1.0 / magnitude;
        return div * Vy;
    }
    function unitVectorZ(Vx, Vy, Vz) {
        var magnitude = (Vx * Vx) + (Vy * Vy) + (Vz * Vz);
        var div = this.constants.INFINITY;
        if (magnitude > 0)
            div = 1.0 / magnitude;
        return div * Vz;
    }
    function sphereNormalX(Sx, Sy, Sz, radius, Px, Py, Pz) {
        var SPx = Px - Sx;
        var SPy = Py - Sy;
        var SPz = Pz - Sz;
        var magnitude = (SPx * SPx) + (SPy * SPy) + (SPz * SPz);
        var div = this.constants.INFINITY;
        if (magnitude > 0)
            div = 1.0 / magnitude;
        return div * SPx;
    }
    function sphereNormalY(Sx, Sy, Sz, radius, Px, Py, Pz) {
        var SPx = Px - Sx;
        var SPy = Py - Sy;
        var SPz = Pz - Sz;
        var magnitude = (SPx * SPx) + (SPy * SPy) + (SPz * SPz);
        var div = this.constants.INFINITY;
        if (magnitude > 0)
            div = 1.0 / magnitude;
        return div * SPy;
    }
    function sphereNormalZ(Sx, Sy, Sz, radius, Px, Py, Pz) {
        var SPx = Px - Sx;
        var SPy = Py - Sy;
        var SPz = Pz - Sz;
        var magnitude = (SPx * SPx) + (SPy * SPy) + (SPz * SPz);
        var div = this.constants.INFINITY;
        if (magnitude > 0)
            div = 1.0 / magnitude;
        return div * SPz;
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
    function sphereIntersectionDistance(Sx, Sy, Sz, radius, Ex, Ey, Ez, Vx, Vy, Vz) {
        var EOx = Sx - Ex;
        var EOy = Sy - Ey;
        var EOz = Sz - Ez;
        var v = (EOx * Vx) + (EOy * Vy) + (EOz * Vz);
        var discriminant = (radius * radius)
            - ((EOx * EOx) + (EOy * EOy) + (EOz * EOz))
            + (v * v);
        if (discriminant < 0) {
            return this.constants.INFINITY;
        }
        else {
            // Length of EP.
            return v - Math.sqrt(discriminant);
        }
    }
    /*----------------------------------------------------------------
     * Trace.
     *--------------------------------------------------------------*/
    // 1. Get ray that hits this point on the canvas. A ray consists of
    //    its point, P and vector, V.
    var x = this.thread.x;
    var y = this.thread.y;
    var rayPx = camera[0];
    var rayPy = camera[1];
    var rayPz = camera[2];
    var rayVx = rays[x][y][0];
    var rayVy = rays[x][y][1];
    var rayVz = rays[x][y][2];
    // 2. Get first intersection, if any.
    var closest = this.constants.THINGSCOUNT;
    var closestDistance = this.constants.INFINITY;
    for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
        var distance = sphereIntersectionDistance(things[i][9], things[i][10], things[i][11], things[i][12], rayPx, rayPy, rayPz, rayVx, rayVy, rayVz);
        if (distance < closestDistance) {
            closest = i;
            closestDistance = distance;
        }
    }
    // 3. If the ray intersects an object, find its colour.
    if (closestDistance < this.constants.INFINITY) {
        // Find point of intersection, P.
        var px = rayPx + rayVx * closestDistance;
        var py = rayPy + rayVy * closestDistance;
        var pz = rayPz + rayVz * closestDistance;
        // Find sphere normal.
        var sx = things[closest][9];
        var sy = things[closest][10];
        var sz = things[closest][11];
        var sRadius = things[closest][12];
        var snVx = sphereNormalX(sx, sy, sz, sRadius, px, py, pz);
        var snVy = sphereNormalY(sx, sy, sz, sRadius, px, py, pz);
        var snVz = sphereNormalZ(sx, sy, sz, sRadius, px, py, pz);
        // Sphere colour and lambertian reflectance.
        var sRed = things[closest][2];
        var sGreen = things[closest][3];
        var sBlue = things[closest][4];
        var lambert = things[closest][6];
        // 3a. Compute Lambert shading.
        var lambertAmount = 0;
        if (lambert > 0) {
            for (var i = 0; i < this.constants.LIGHTSCOUNT; i++) {
                // Check is if light is visible on this point.
                var LPx = px - lights[i][0];
                var LPy = py - lights[i][1];
                var LPz = pz - lights[i][2];
                var uLPx = unitVectorX(LPx, LPy, LPz);
                var uLPy = unitVectorY(LPx, LPy, LPz);
                var uLPz = unitVectorZ(LPx, LPy, LPz);
                var closest = this.constants.THINGSCOUNT;
                var closestDistance = this.constants.INFINITY;
                for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
                    // Find sphere intersection distance from light source
                    var distance = this.constants.INFINITY;
                    var EOx = things[i][9] - px;
                    var EOy = things[i][10] - py;
                    var EOz = things[i][11] - pz;
                    var v = (EOx * uLPx) + (EOy * uLPy) + (EOz * uLPz);
                    var radius = things[i][12];
                    var discriminant = (radius * radius)
                        - ((EOx * EOx) + (EOy * EOy) + (EOz * EOz))
                        + (v * v);
                    // if (discriminant >= 0) {
                    if (discriminant > 0) {
                        // Length of EP.
                        distance = v - Math.sqrt(discriminant);
                    }
                    if (distance < closestDistance) {
                        closest = i;
                        closestDistance = distance;
                    }
                }
                // If isLighted.
                if (closestDistance > -0.005) {
                    var PLx = -LPx;
                    var PLy = -LPy;
                    var PLz = -LPz;
                    var uPLx = unitVectorX(PLx, PLy, PLz);
                    var uPLy = unitVectorY(PLx, PLy, PLz);
                    var uPLz = unitVectorZ(PLx, PLy, PLz);
                    var contribution = vectorDotProduct(uPLx, uPLy, uPLz, snVx, snVy, snVz);
                    if (contribution > 0)
                        lambertAmount += contribution;
                }
            }
        }
        lambertAmount = Math.min(1, lambertAmount);
        // 3b. Compute specular reflection.
        var specular = things[closest][5];
        var cVx = 0;
        var cVy = 0;
        var cVz = 0;
        if (specular > 0) {
        }
        // 3c. Combine and set colour at point.
        var ambient = things[closest][7];
        var red = cVx + (sRed * lambertAmount * lambert) + (sRed * ambient);
        var green = cVy + (sGreen * lambertAmount * lambert) + (sGreen * ambient);
        var blue = cVz + (sBlue * lambertAmount * lambert) + (sBlue * ambient);
        this.color(red, green, blue);
    }
    else {
        // Default canvas background colour
        this.color(0.95, 0.95, 0.95);
    }
}, opt('gpu'));
// http://www.comp.nus.edu.sg/~hugh/CS3211/demm.html
function computeRays(camera) {
    var cameraPoint = new Vector(camera[0], camera[1], camera[2]);
    var cameraVector = new Vector(camera[3], camera[4], camera[5]);
    var eyeVector = Vector.norm(Vector.minus(cameraVector, cameraPoint));
    var vpRight = Vector.norm(Vector.cross(eyeVector, new Vector(0, 1, 0)));
    var vpUp = Vector.norm(Vector.cross(vpRight, eyeVector));
    var fovRadians = Math.PI * (camera[6] / 2) / 180;
    var heightWidthRatio = height / width;
    var halfWidth = Math.tan(fovRadians);
    var halfHeight = heightWidthRatio * halfWidth;
    var camerawidth = halfWidth * 2;
    var cameraheight = halfHeight * 2;
    var pixelWidth = camerawidth / (width - 1);
    var pixelHeight = cameraheight / (height - 1);
    // WHY not use raysX, raysY, and raysZ???
    // You can only pass in at most 8MB
    var rays = [];
    for (var x = 0; x < width; x++) {
        rays.push([]);
        for (var y = 0; y < height; y++) {
            var xcomp = Vector.times((x * pixelWidth) - halfWidth, vpRight);
            var ycomp = Vector.times((y * pixelHeight) - halfHeight, vpUp);
            var ray = Vector.norm(Vector.plus(Vector.plus(eyeVector, xcomp), ycomp));
            rays[x].push(ray.toArray());
        }
    }
    return rays;
}
var canvas = kernel.getCanvas();
document.getElementById('container').appendChild(canvas);
var fps = {
    startTime: 0,
    frameNumber: 0,
    getFPS: function () {
        this.frameNumber++;
        var d = new Date().getTime();
        var currentTime = (d - this.startTime) / 1000;
        var result = Math.floor(this.frameNumber / currentTime);
        if (currentTime > 1) {
            this.startTime = new Date().getTime();
            this.frameNumber = 0;
        }
        return result;
    }
};
var f = document.getElementById('fps');
var rays = computeRays(camera);
function renderLoop() {
    f.innerHTML = fps.getFPS();
    kernel(camera, lights, things, rays);
    var canvas = kernel.getCanvas();
    var cv = document.getElementsByTagName('canvas')[0];
    cv.parentNode.replaceChild(canvas, cv);
    things.forEach(function (thing) {
        thing[10] = (thing[10] + 0.1) % 10;
    });
    requestAnimationFrame(renderLoop);
}
window.onload = renderLoop;
//# sourceMappingURL=raytracer.js.map