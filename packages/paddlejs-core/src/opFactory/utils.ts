/**
 * @file op 工具函数
 * @author zhangjingyuan
 */
import { ModelOp } from '../commons/interface';

interface conf {
    inputName: string;
    outputName: string;
}
/**
 * Create an unpacked2packedOp
 * @param {Object} conf
 * @param {string} conf.inputName - op inputname
 * @param {string} conf.outputName - op outputname
 * @returns {Object} unpacked2packedOp
 */
export function createUnpacked2packedOp({
    inputName,
    outputName
}: conf) {
    const newOp = {
        type: 'unpacked_2_packed',
        attrs: {},
        inputs: {
            Input: [inputName]
        },
        outputs: {
            Output: [outputName]
        }
    };
    return newOp;
}

/**
 * pad op data
 *
 * @param {Object} data - op origin data
 */
export function padOpData(data: Float32Array | number[], shape: number[], packed: boolean) {
    const glVersion = 2;
    let tensorData = data;
    if (tensorData && tensorData.length > 0) {
        if (glVersion === 2) {
            return data;
        }
        if (!packed) {
            const temp = new Float32Array(shape.reduce((total, num) => total * num, 4));
            for (let i = 0; i < tensorData.length; i++) {
                // 填充 r 通道数据，其他通道 为 0
                temp[i * 4] = tensorData[i];
                temp[i * 4 + 1] = 0;
                temp[i * 4 + 2] = 0;
                temp[i * 4 + 3] = 0;
            }
            tensorData = temp;
        }
    }
    return tensorData;
}

/**
 * pack op data
 *
 * @param {Object} opData - op origin data
 * @param {string} packedName - op packed name
 * @returns {Object} packed data
 */
export function packOpData(opData: any, packedName: string) {
    const [b, c, h, w] = opData.shape.length === 3 ? [1, ...opData.shape] : opData.shape;
    const packedOpData = Object.assign({}, opData);
    packedOpData.name = packedName;
    packedOpData.packed = false;
    if (c % 4 === 0) {
        // 紧凑布局
        const packed_c = c / 4;
        packedOpData.packed = true;
        packedOpData.shape = [b, packed_c, h, w];
    }
    return packedOpData;
}

/**
 * Create an packed2unpackedOp
 * @param {Object} conf
 * @param {string} conf.inputName - op inputname
 * @param {string} conf.outputName - op outputname
 * @returns {Object} packed2unpackedOp
 */
export function createPacked2unpackedOp({
    inputName,
    outputName
}: conf) {
    const newOp = {
        type: 'packed_2_unpacked',
        attrs: {},
        inputs: {
            Input: [inputName]
        },
        outputs: {
            Output: [outputName]
        }
    };
    return newOp;
}

/**
 * transform origin op which supports pack
 * @param {Object} op - origin op OpExecutor
 * @returns {Object} transformed op
 */
export function transformOriginOp(op: ModelOp) {
    const newOp = JSON.parse(JSON.stringify(op));
    Object.keys(newOp.inputs)
        .forEach(key => {
            newOp.inputs[key] = [`${newOp.inputs[key]}_packed`];
        });
    Object.keys(newOp.outputs)
        .forEach(key => {
            newOp.outputs[key] = [`${newOp.outputs[key]}_packed`];
        });
    return newOp;
}


/**
 * 获取texture形状和补0个数
 * @param {Array} shape tensor的形状
 * @param {boolean} isPacked 是否是packed op
 * @returns {Object} texture信息
 */
export function getTextureInfoFromTensorShape(shape = [], isPacked = false) {
    const GPU_TEXTURE_MAX_SIZE = 4096;
    const b = shape[0];
    const c = shape[1];
    const h = shape[2];
    const w = shape[3];
    let height = b * h;
    let width = c * w;

    // 安卓和ios的max texture size是4096, 改造存储空间(4bh, cw / 4)
    let exceedMax = false;
    if (isPacked) {
        const packed_c = c;
        const zeroNumber = height * packed_c * w * 4 - height * width;
        return {
            exceedMax,
            shape: [4, height, width],
            packedShape: [b, packed_c, h, w],
            packedTextureShape: [4, height, packed_c * w],
            zeroNumber
        };
    }
    // trick TEXTURE_SIZE 超限问题，后续升级更优解
    if (height > GPU_TEXTURE_MAX_SIZE || width > GPU_TEXTURE_MAX_SIZE) {
        console.error('大小超限', shape);
        height *= 4;
        width = c * (Math.ceil(w / 4));
        exceedMax = true;
        if (height > GPU_TEXTURE_MAX_SIZE || width > GPU_TEXTURE_MAX_SIZE) {
            const requested = `[${width}x${height}]`;
            const max = `[${GPU_TEXTURE_MAX_SIZE}x${GPU_TEXTURE_MAX_SIZE}]`;
            throw new Error(
                'Requested texture size ' + requested
                + ' greater than WebGL maximum on this browser / GPU ' + max + '.');
        }
    }

    return {
        exceedMax,
        shape: [4, height, width],
        zeroNumber: 0
    };
}

// 将nchw排布数据转为nhwc排布数据
export function nchw2nhwc(data: number[] | Float32Array, shape: number[]) {
    const N = shape[0];
    const C = shape[1];
    const H = shape[2];
    const W = shape[3];
    const HXW = H * W;
    const CXHXW = C * H * W;
    const nhwcData: number[] | Float32Array = [];
    for (let n = 0; n < N; n++) {
        for (let h = 0; h < H; h++) {
            for (let w = 0; w < W; w++) {
                for (let c = 0; c < C; c++) {
                    nhwcData.push(data[n * CXHXW + c * HXW + h * W + w]);
                }
            }
        }
    }
    return nhwcData;
}