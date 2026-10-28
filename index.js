import './src/core/polyfills';
import {AppRegistry, Dimensions, PixelRatio} from 'react-native';
import {App} from './src/App';
import {name as appName} from './app.json';

const win = Dimensions.get('window');
console.log(`pileus: window ${win.width}x${win.height} ratio ${PixelRatio.get()} font ${PixelRatio.getFontScale()}`);

AppRegistry.registerComponent(appName, () => App);
