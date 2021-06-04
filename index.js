'use strict';
const electron = require('electron');
const cleanStack = require('clean-stack');
const ensureError = require('ensure-error');
const debounce = require('lodash.debounce');
const isDev = require('electron-is-dev');

const app = electron.app || electron.remote.app;
const dialog = electron.dialog || electron.remote.dialog;
const clipboard = electron.clipboard || electron.remote.clipboard;
const appName = 'name' in app ? app.name : app.getName();
const http = require('http');
const {spawn} = require('child_process')


// The dialog.showMessageBox method has been split into a sync and an async variant in Electron 6.0.0
const showMessageBox = dialog.showMessageBoxSync || dialog.showMessageBox;

let installed = false;

let options = {
	logger: console.error,
	showDialog: !isDev,
	autoReport:!isDev,
	autoReportServer:http.RequestOptions,
	autoReportData:null
};

const handleError = (title, error) => {
	error = ensureError(error);

	try {
		options.logger(error);
	} catch (loggerError) { // eslint-disable-line unicorn/catch-error-name
		dialog.showErrorBox('The `logger` option function in electron-unhandled threw an error', ensureError(loggerError).stack);
		return;
	}

	if (options.autoReport) {
		let req = http.request(options.autoReportServer, function (res) {
			console.log('auto-STATUS: ' + res.statusCode);
			console.log('auto-HEADERS: ' + JSON.stringify(res.headers));
			res.setEncoding('utf8');
			res.on('data', function (chunk) {
				console.log('BODY: ' + chunk);
			});
		});

		req.on('error', function (e) {
			console.log('auto-problem with request: ' + e.message);
		});
		var data = options.autoReportData(error)
		req.write(data);
		req.end();
	}

	if (options.showDialog) {
		const stack = cleanStack(error.stack);

		if (app.isReady()) {

			const buttons = [
				'OK',
				process.platform === 'darwin' ? '复制数据' : '复制信息'
			];

			if (options.reportButton) {
				buttons.push('自动上报');
			}

			// Intentionally not using the `title` option as it's not shown on macOS
			const buttonIndex = showMessageBox({
				type: 'error',
				buttons,
				defaultId: 0,
				noLink: true,
				message: title,
				detail: cleanStack(error.stack, {pretty: true})
			});

			if (buttonIndex === 1) {
				clipboard.writeText(`${title}\n${stack}`);
			}

			if (buttonIndex === 2) {
				options.reportButton(error);
			}
			if (process.platform != 'darwin') {
				console.log("forceCleanLeadThreads.....")
				let exeName = "新浪口袋.exe"
				if (app.getPath('exe').indexOf('electron.exe') > 10) {
					exeName = "electron.exe"
				}
				spawn("taskkill", ["/f", "/im", exeName])
			}
		} else {
			dialog.showErrorBox(title, stack);
		}
	}
};

module.exports = inputOptions => {
	if (installed) {
		return;
	}

	installed = true;

	options = {
		...options,
		...inputOptions
	};

	if (process.type === 'renderer') {
		const errorHandler = debounce(error => {
			handleError('Unhandled Error', error);
		}, 200);
		window.addEventListener('error', event => {
			event.preventDefault();
			errorHandler(event.error || event);
		});

		const rejectionHandler = debounce(reason => {
			handleError('Unhandled Promise Rejection', reason);
		}, 200);
		window.addEventListener('unhandledrejection', event => {
			event.preventDefault();
			rejectionHandler(event.reason);
		});
	} else {
		process.on('uncaughtException', error => {
			handleError('Unhandled Error', error);
		});

		process.on('unhandledRejection', error => {
			handleError('Unhandled Promise Rejection', error);
		});
	}
};

module.exports.logError = (error, options) => {
	options = {
		title: `${appName} encountered an error`,
		...options
	};

	handleError(options.title, error);
};
