import * as path from 'node:path';
import {fixPathForAsarUnpack} from 'electron-util';

export const caprineIconPath = fixPathForAsarUnpack(path.join(__dirname, '..', 'static', 'Icon.png'));
export const caprineIconLightPath = fixPathForAsarUnpack(path.join(__dirname, '..', 'static', 'Icon-light.png'));
export const caprineIconDarkPath = fixPathForAsarUnpack(path.join(__dirname, '..', 'static', 'Icon-dark.png'));
