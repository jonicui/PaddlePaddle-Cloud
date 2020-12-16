import WebGPUBackend from './gpu';
import buildShader from './buildShader';
import {ops} from './ops';
import {registerOp, registerBackend} from 'paddlejs-core/src/index';


/* global GPUBufferUsage */

WebGPUBackend.prototype.createProgram = function (opts) {
    const {
        name,
        runtime,
        shaderParams
    } = opts;
    return buildShader(name, {
        ...shaderParams,
        runtime
    });
};

WebGPUBackend.prototype.runProgram = function (type, opData, isRendered) {
    const {
        iLayer,
        inputTensors,
        outputTensors,
        program
    } = opData;
    const outTensorIds = [];
    inputTensors.forEach(tensor => {
        this.buildMappedBuffer(tensor, iLayer);
    });
    outputTensors.forEach(tensor => {
        this.buildOutputBuffer(tensor, iLayer);
        outTensorIds.push(tensor.tensorId);
    });
    program.forEach((shader, index) => {
        this.createBindGroupLayout(iLayer, outTensorIds);
        this.createComputePipeline(shader);
        this.createBindGroup(iLayer, outTensorIds);
        this.execute(outputTensors[index].shape_texture);
        this.submitEncodedCommands();
    });
}

WebGPUBackend.prototype.read = async function (fetchInfo) {
    const fetchId = fetchInfo.name;
    const fetchShape = fetchInfo.shape;
    const fetchByteLength = fetchShape.reduce((acc, cur) => acc * cur, 1) * 4;
    this.createReadBuffer({
        size: fetchByteLength
    });
    this.copyBufferToBuffer(
        this.outputLayersMap[fetchId].buffer,
        this.readBuffer,
        0,
        0,
        fetchByteLength);
    return await this.readData();
};

const gpuInstance = new WebGPUBackend();

function registerWebGPUBackend() {
    registerBackend(
        'webgpu',
        gpuInstance
    );
    Object.keys(ops).forEach(key => {
        registerOp(ops[key], key);
    });
    return gpuInstance;
}

export default registerWebGPUBackend;
