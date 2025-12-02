import sharp from 'sharp';
import fs from "fs";
import { promisify } from 'node:util';
import child_process from 'node:child_process';
import { config } from './config.mjs';

const exec = promisify(child_process.exec);

const sizes = [
    {
        name: "4k",
        scale: 4,
        finalSize: 96,
        moveX: 0,
        moveY: 0,
        moveShadowX: 0,
        moveShadowY: 0,
        blur: 2,
        padding: 4
    },
    {
        name: "2k",
        scale: 2,
        finalSize: 48,
        moveX: 0,
        moveY: 0,
        moveShadowX: 0,
        moveShadowY: 0,
        blur: 2,
        padding: 4
    },
    {
        name: "1k",
        scale: 1,
        finalSize: 24,
        moveX: 0,
        moveY: 0,
        moveShadowX: 0,
        moveShadowY: 0,
        blur: 1,
        padding: 2
    }
];

const IMG_DEST_PATH = "dist/img/";
const THEME_DEST_PATH = "dist/BitplaneCursor";

const SRC_PATH = "designs/";

const themeDefinition = `[Icon Theme]
Name=BitplaneCursor{suffix}
Example=left_ptr
Inherits=core
`;

async function resizeAndShadow(fileName, sizeConfig) {
    const image = sharp(fileName);
    const m = await image.metadata();
    const width = m.width || 1;
    const height = m.height || 1;

    const resized = image.clone().resize(width * sizeConfig.scale, height * sizeConfig.scale, { kernel: 'nearest' });
    const withBorder = resized.clone().extend({
        top: sizeConfig.padding,
        bottom: sizeConfig.padding,
        left: sizeConfig.padding,
        right: sizeConfig.padding,
        background: "#00000000"
    });

    const alpha = await withBorder.clone().extractChannel('alpha').toBuffer();
    // Linear does not directly work on alpha channels, so we need to convert it to a grayscale image first
    const shadowMask = sharp(alpha).blur(sizeConfig.blur).linear(0.3, 0);

    const finalSize = {
        width: width * sizeConfig.scale + sizeConfig.padding * 2,
        height: height * sizeConfig.scale + sizeConfig.padding * 2
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
        { input: await shadow.toBuffer(), left: sizeConfig.moveShadowX, top: sizeConfig.moveShadowY },
        { input: await resized.toBuffer(), left: sizeConfig.moveX, top: sizeConfig.moveY },
    ]).extend({
        right: Math.max(sizeConfig.finalSize - finalSize.width, 0),
        bottom: Math.max(sizeConfig.finalSize - finalSize.height, 0),
        background: "#00000000"
    }).toFormat("png");

    const scaledFinal = sharp(await final.toBuffer()).extract(
        {
            left: 0,
            top: 0,
            width: sizeConfig.finalSize,
            height: sizeConfig.finalSize
        }
    );

    return scaledFinal;
};

(async () => {
    fs.mkdirSync(IMG_DEST_PATH, { recursive: true });

    for (const sizeConfig of sizes) {
        const themePath = THEME_DEST_PATH + `-${sizeConfig.name}/cursors/`;
        fs.mkdirSync(themePath, { recursive: true });
        for (var [key, value] of Object.entries(config)) {
            // console.log(key, value);
            const xcursorConfig = [];
            const { scale, finalSize, moveX, moveY } = sizeConfig;
            const fileName = IMG_DEST_PATH + key + `@${sizeConfig.name}.png`;
            const image = await resizeAndShadow(SRC_PATH + value.file + '.png', sizeConfig);
            await image.toFile(fileName);
            const hotspox = Math.min(finalSize - 1, value.x * scale + moveX);
            const hotpoty = Math.min(finalSize - 1, value.y * scale + moveY);
            xcursorConfig.push(`${finalSize} ${hotspox} ${hotpoty} ${fileName}\n`);
            fs.writeFileSync(IMG_DEST_PATH + key + '.cursor', xcursorConfig.join(''), 'utf8');
            const finalFileName = themePath + key;
            const cmd = `xcursorgen ${IMG_DEST_PATH + key + '.cursor'} ${finalFileName}`;
            console.log(cmd);
            const { stdout, stderr } = await exec(cmd);
            console.log('stdout:', stdout);
            console.error('stderr:', stderr);
        }
        const themeDef = themeDefinition.replace("{suffix}", `-${sizeConfig.name}`);
        const themePathFull = themePath + "/../index.theme";
        fs.writeFileSync(themePathFull, themeDef, 'utf8');
    }

})();