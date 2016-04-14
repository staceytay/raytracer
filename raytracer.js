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
var Mode;
(function (Mode) {
    Mode[Mode["GPU"] = 0] = "GPU";
    Mode[Mode["CPU"] = 1] = "CPU";
})(Mode || (Mode = {}));
var Thing;
(function (Thing) {
    Thing[Thing["SPHERE"] = 0] = "SPHERE";
})(Thing || (Thing = {}));
var height = 600;
var width = height;
var camera = [
    0, 0, 16, 0, 0, 1, 45
];
var lights = [
    [-16, 16, 8],
    [16, 16, 8],
];
var things = [
    [0, 13,
        1.0, 0.0, 0.0,
        0.3, 0.7, 0.2, 1.0,
        -2, 0, -2, 1],
    [0, 13,
        0.0, 1.0, 0.0,
        0.3, 0.7, 0.2, 1.0,
        0, 0, 0, 1],
    [0, 13,
        0.0, 0.0, 1.0,
        0.3, 0.7, 0.2, 1.0,
        2, 0, 2, 1],
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
var kernel = gpu.createKernel(function (camera, lights, things, eyeV, rightV, upV, halfHeight, halfWidth, pixelHeight, pixelWidth) {
    function vectorDotProduct(V1x, V1y, V1z, V2x, V2y, V2z) {
        return (V1x * V2x) + (V1y * V2y) + (V1z * V2z);
    }
    function unitVectorX(Vx, Vy, Vz) {
        var magnitude = Math.sqrt((Vx * Vx) + (Vy * Vy) + (Vz * Vz));
        var div = 1.0 / magnitude;
        return div * Vx;
    }
    function unitVectorY(Vx, Vy, Vz) {
        var magnitude = Math.sqrt((Vx * Vx) + (Vy * Vy) + (Vz * Vz));
        var div = 1.0 / magnitude;
        return div * Vy;
    }
    function unitVectorZ(Vx, Vy, Vz) {
        var magnitude = Math.sqrt((Vx * Vx) + (Vy * Vy) + (Vz * Vz));
        var div = 1.0 / magnitude;
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
    function vectorReflectX(Vx, Vy, Vz, Nx, Ny, Nz) {
        var V1x = ((Vx * Nx) + (Vy * Ny) + (Vz * Nz)) * Nx;
        return (V1x * 2) - Vx;
    }
    function vectorReflectY(Vx, Vy, Vz, Nx, Ny, Nz) {
        var V1y = ((Vx * Nx) + (Vy * Ny) + (Vz * Nz)) * Ny;
        return (V1y * 2) - Vy;
    }
    function vectorReflectZ(Vx, Vy, Vz, Nx, Ny, Nz) {
        var V1z = ((Vx * Nx) + (Vy * Ny) + (Vz * Nz)) * Nz;
        return (V1z * 2) - Vz;
    }
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
            return v - Math.sqrt(discriminant);
        }
    }
    var x = this.thread.x;
    var y = this.thread.y;
    var rayPx = camera[0];
    var rayPy = camera[1];
    var rayPz = camera[2];
    var xCompVx = ((x * pixelWidth) - halfWidth) * rightV[0];
    var xCompVy = ((x * pixelWidth) - halfWidth) * rightV[1];
    var xCompVz = ((x * pixelWidth) - halfWidth) * rightV[2];
    var yCompVx = ((y * pixelHeight) - halfHeight) * upV[0];
    var yCompVy = ((y * pixelHeight) - halfHeight) * upV[1];
    var yCompVz = ((y * pixelHeight) - halfHeight) * upV[2];
    var sumVx = eyeV[0] + xCompVx + yCompVx;
    var sumVy = eyeV[1] + xCompVy + yCompVy;
    var sumVz = eyeV[2] + xCompVz + yCompVz;
    var rayVx = unitVectorX(sumVx, sumVy, sumVz);
    var rayVy = unitVectorY(sumVx, sumVy, sumVz);
    var rayVz = unitVectorZ(sumVx, sumVy, sumVz);
    var closest = this.constants.THINGSCOUNT;
    var closestDistance = this.constants.INFINITY;
    for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
        var distance = sphereIntersectionDistance(things[i][9], things[i][10], things[i][11], things[i][12], rayPx, rayPy, rayPz, rayVx, rayVy, rayVz);
        if (distance < closestDistance) {
            closest = i;
            closestDistance = distance;
        }
    }
    if (closestDistance < this.constants.INFINITY) {
        var px = rayPx + rayVx * closestDistance;
        var py = rayPy + rayVy * closestDistance;
        var pz = rayPz + rayVz * closestDistance;
        var sx = things[closest][9];
        var sy = things[closest][10];
        var sz = things[closest][11];
        var sRadius = things[closest][12];
        var snVx = sphereNormalX(sx, sy, sz, sRadius, px, py, pz);
        var snVy = sphereNormalY(sx, sy, sz, sRadius, px, py, pz);
        var snVz = sphereNormalZ(sx, sy, sz, sRadius, px, py, pz);
        var sRed = things[closest][2];
        var sGreen = things[closest][3];
        var sBlue = things[closest][4];
        var ambient = things[closest][7];
        var lambert = things[closest][6];
        var lambertAmount = 0;
        if (lambert > 0) {
            for (var i = 0; i < this.constants.LIGHTSCOUNT; i++) {
                var LPx = px - lights[i][0];
                var LPy = py - lights[i][1];
                var LPz = pz - lights[i][2];
                var uLPx = unitVectorX(LPx, LPy, LPz);
                var uLPy = unitVectorY(LPx, LPy, LPz);
                var uLPz = unitVectorZ(LPx, LPy, LPz);
                var closestDistance = this.constants.INFINITY;
                for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
                    var distance = this.constants.INFINITY;
                    var EOx = things[i][9] - px;
                    var EOy = things[i][10] - py;
                    var EOz = things[i][11] - pz;
                    var v = (EOx * uLPx) + (EOy * uLPy) + (EOz * uLPz);
                    var radius = things[i][12];
                    var discriminant = (radius * radius)
                        - ((EOx * EOx) + (EOy * EOy) + (EOz * EOz))
                        + (v * v);
                    if (discriminant >= 0) {
                        distance = v - Math.sqrt(discriminant);
                    }
                    if (distance < closestDistance) {
                        closestDistance = distance;
                    }
                }
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
        var specular = things[closest][5];
        var cVx = 0;
        var cVy = 0;
        var cVz = 0;
        if (specular > 0) {
            var rRayPx = px;
            var rRayPy = py;
            var rRayPz = pz;
            var rRayVx = vectorReflectX(rayVx, rayVy, rayVz, snVx, snVy, snVz);
            var rRayVy = vectorReflectY(rayVx, rayVy, rayVz, snVx, snVy, snVz);
            var rRayVz = vectorReflectZ(rayVx, rayVy, rayVz, snVx, snVy, snVz);
            var closest = this.constants.THINGSCOUNT;
            var closestDistance = this.constants.INFINITY;
            for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
                var distance = sphereIntersectionDistance(things[i][9], things[i][10], things[i][11], things[i][12], rRayPx, rRayPy, rRayPz, rRayVx, rRayVy, rRayVz);
                if (distance < closestDistance) {
                    closest = i;
                    closestDistance = distance;
                }
            }
            var reflectedRed = 1;
            var reflectedGreen = 1;
            var reflectedBlue = 1;
            if (closestDistance < this.constants.INFINITY) {
                var px_1 = rRayPx + rRayVx * closestDistance;
                var py_1 = rRayPy + rRayVy * closestDistance;
                var pz_1 = rRayPz + rRayVz * closestDistance;
                var sx_1 = things[closest][9];
                var sy_1 = things[closest][10];
                var sz_1 = things[closest][11];
                var sRadius_1 = things[closest][12];
                var snVx_1 = sphereNormalX(sx_1, sy_1, sz_1, sRadius_1, px_1, py_1, pz_1);
                var snVy_1 = sphereNormalY(sx_1, sy_1, sz_1, sRadius_1, px_1, py_1, pz_1);
                var snVz_1 = sphereNormalZ(sx_1, sy_1, sz_1, sRadius_1, px_1, py_1, pz_1);
                var rsRed = things[closest][2];
                var rsGreen = things[closest][3];
                var rsBlue = things[closest][4];
                var rambient = things[closest][7];
                var rlambert = things[closest][6];
                var rlambertAmount = 0;
                if (rlambert > 0) {
                    for (var i = 0; i < this.constants.LIGHTSCOUNT; i++) {
                        var LPx = px_1 - lights[i][0];
                        var LPy = py_1 - lights[i][1];
                        var LPz = pz_1 - lights[i][2];
                        var uLPx = unitVectorX(LPx, LPy, LPz);
                        var uLPy = unitVectorY(LPx, LPy, LPz);
                        var uLPz = unitVectorZ(LPx, LPy, LPz);
                        var closest = this.constants.THINGSCOUNT;
                        var closestDistance = this.constants.INFINITY;
                        for (var i = 0; i < this.constants.THINGSCOUNT; i++) {
                            var distance = this.constants.INFINITY;
                            var EOx = things[i][9] - px_1;
                            var EOy = things[i][10] - py_1;
                            var EOz = things[i][11] - pz_1;
                            var v = (EOx * uLPx) + (EOy * uLPy) + (EOz * uLPz);
                            var radius = things[i][12];
                            var discriminant = (radius * radius)
                                - ((EOx * EOx) + (EOy * EOy) + (EOz * EOz))
                                + (v * v);
                            if (discriminant >= 0) {
                                distance = v - Math.sqrt(discriminant);
                            }
                            if (distance < closestDistance) {
                                closest = i;
                                closestDistance = distance;
                            }
                        }
                        if (closestDistance > -0.005) {
                            var PLx = -LPx;
                            var PLy = -LPy;
                            var PLz = -LPz;
                            var uPLx = unitVectorX(PLx, PLy, PLz);
                            var uPLy = unitVectorY(PLx, PLy, PLz);
                            var uPLz = unitVectorZ(PLx, PLy, PLz);
                            var contribution = vectorDotProduct(uPLx, uPLy, uPLz, snVx_1, snVy_1, snVz_1);
                            if (contribution > 0)
                                rlambertAmount += contribution;
                        }
                    }
                }
                rlambertAmount = Math.min(1, rlambertAmount);
                reflectedRed = (rsRed * rlambertAmount * rlambert) + (rsRed * rambient);
                reflectedGreen = (rsGreen * rlambertAmount * rlambert) + (rsGreen * rambient);
                reflectedBlue = (rsBlue * rlambertAmount * rlambert) + (rsBlue * rambient);
                cVx = cVx + (specular * reflectedRed);
                cVy = cVy + (specular * reflectedGreen);
                cVz = cVz + (specular * reflectedBlue);
            }
        }
        var red = cVx + (sRed * lambertAmount * lambert) + (sRed * ambient);
        var green = cVy + (sGreen * lambertAmount * lambert) + (sGreen * ambient);
        var blue = cVz + (sBlue * lambertAmount * lambert) + (sBlue * ambient);
        this.color(red, green, blue);
    }
    else {
        this.color(0.95, 0.95, 0.95);
    }
}, opt('gpu'));
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
var cameraPoint = new Vector(camera[0], camera[1], camera[2]);
var cameraVector = new Vector(camera[3], camera[4], camera[5]);
var eyeVector = Vector.norm(Vector.minus(cameraVector, cameraPoint));
var vpRight = Vector.norm(Vector.cross(eyeVector, new Vector(0, 1, 0)));
var vpUp = Vector.norm(Vector.cross(vpRight, eyeVector));
var fovRadians = Math.PI * (camera[6] / 2) / 180;
var heightWidthRatio = height / width;
var halfWidth = Math.tan(fovRadians);
var halfHeight = heightWidthRatio * halfWidth;
var cameraWidth = halfWidth * 2;
var cameraHeight = halfHeight * 2;
var pixelWidth = cameraWidth / (width - 1);
var pixelHeight = cameraHeight / (height - 1);
var f = document.getElementById('fps');
function renderLoop() {
    f.innerHTML = fps.getFPS().toString();
    kernel(camera, lights, things, eyeVector.toArray(), vpRight.toArray(), vpUp.toArray(), halfHeight, halfWidth, pixelHeight, pixelWidth);
    var canvas = kernel.getCanvas();
    var cv = document.getElementsByTagName('canvas')[0];
    cv.parentNode.replaceChild(canvas, cv);
    things.forEach(function (thing) {
        var height = this.height / (halfHeight * 2 * 100);
        if (thing[10] < height)
            thing[10] = (thing[10] + 0.02) % (height + 1);
        else
            thing[10] = -1 * height;
    });
    requestAnimationFrame(renderLoop);
}
window.onload = renderLoop;
//# sourceMappingURL=raytracer.js.map