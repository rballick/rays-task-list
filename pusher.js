const Pusher = require('pusher');

class MyPusher { 
	constructor() {
		this._pusher = new Pusher({
		  appId: '683939',
		  key: 'ee9677b636388255d8e5',
		  secret: '5f0ce01dfb28c5816efa',
		  cluster: 'us2',
		  useTLS: true
		});
	}
	trigger = (channel, e, triggers) => {
		return new Promise((resolve, reject) => {
			if (typeof triggers === 'object') {
				this._pusher.trigger(channel, e, triggers);
				console.log('pushed');
				resolve(true);
			} else {
				resolve(false);
			}
		});
	}
}

module.exports = MyPusher;
