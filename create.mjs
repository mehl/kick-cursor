import sharp from 'sharp';
import fs from "fs";
import { promisify } from 'node:util';
import child_process from 'node:child_process';
import { config } from './config.mjs';

const exec = promisify(child_process.exec);


const SCALE = 4;
const FINAL_SIZE = 96;
const MOVE_X = 0;
const MOVE_Y = 0;
const MOVE_SHADOW_X = 0;
const MOVE_SHADOW_Y = 0;
const BLUR = 2;
const PADDING = BLUR * 2;

const IMG_DEST_PATH = "dist/img/";
const XCURSOR_DEST_PATH = "dist/kick-cursor/";

const SRC_PATH = "designs/";

async function resizeAndShadow(fileName) {
    const image = sharp(fileName);
    const m = await image.metadata();
    const width = m.width || 1;
    const height = m.height || 1;

    const resized = image.clone().resize(width * SCALE, height * SCALE, { kernel: 'nearest' });
    const withBorder = resized.clone().extend({
        top: PADDING,
        bottom: PADDING,
        left: PADDING,
        right: PADDING,
        background: "#00000000"
    });

    const alpha = await withBorder.clone().extractChannel('alpha').toBuffer();
    // Linear does not directly work on alpha channels, so we need to convert it to a grayscale image first
    const shadowMask = sharp(alpha).blur(BLUR).linear(0.3, 0);

    const finalSize = {
        width: width * SCALE + PADDING * 2,
        height: height * SCALE + PADDING * 2
    }
    console.log("Size from ", width, height, "to", finalSize);

    const shadow = sharp({
        create: {
            width: finalSize.width,
            height: finalSize.height,
            channels: 3,
            background: { r: 0, g: 0, b: 0 }
        }
    }).joinChannel([await shadowMask.toBuffer()]).toFormat("png");

    const final = sharp({
        create: {
            width: finalSize.width,
            height: finalSize.height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    }).composite([
        { input: await shadow.toBuffer(), left: MOVE_SHADOW_X, top: MOVE_SHADOW_Y },
        { input: await resized.toBuffer(), left: MOVE_X, top: MOVE_Y },
    ]).extend({
        right: Math.max(FINAL_SIZE - finalSize.width, 0),
        bottom: Math.max(FINAL_SIZE - finalSize.height, 0),
        background: "#00000000"
    }).toFormat("png");

    const scaledFinal = sharp(await final.toBuffer()).extract(
        {
            left: 0,
            top: 0,
            width: FINAL_SIZE,
            height: FINAL_SIZE
        }
    );

    return scaledFinal;
};

(async () => {
    fs.mkdirSync(IMG_DEST_PATH, { recursive: true });
    fs.mkdirSync(XCURSOR_DEST_PATH, { recursive: true });
    for (var [key, value] of Object.entries(config)) {
        console.log(key, value);
        const image = await resizeAndShadow(SRC_PATH + value.file + '.png');
        await image.toFile(IMG_DEST_PATH + key + '.png');
        const hotspox = Math.min(FINAL_SIZE - 1, value.x * SCALE + MOVE_X);
        const hotpoty = Math.min(FINAL_SIZE - 1, value.y * SCALE + MOVE_Y);
        fs.writeFileSync(IMG_DEST_PATH + key + '.cursor', `${FINAL_SIZE} ${hotspox} ${hotpoty} ${IMG_DEST_PATH + key}.png\n`);

        const cmd = `xcursorgen ${IMG_DEST_PATH + key + '.cursor'} ${XCURSOR_DEST_PATH + key}`;
        console.log(cmd);
        const { stdout, stderr } = await exec(cmd);
        console.log('stdout:', stdout);
        console.error('stderr:', stderr);

    };

})();