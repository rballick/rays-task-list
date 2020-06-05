const mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
const moment = require('moment');
require('moment-timezone');

mongoose.set('useFindAndModify', false);
const db_url = process.env.NODE_ENV === 'production' || true ? 'webuser:g7kfnPc_k8Lvxx4m@ds257314.mlab.com:57314/heroku_g6fzwb1w' : 'localhost:27017/task_list';
mongoose.connect(`mongodb://${db_url}`, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.connection.on("connected", function(ref) {
	console.log("Connected to db " + mongoose.connection.name + " on port " + mongoose.connection.port)
});

class Task {
	constructor() {
		this._model = require('./model/task');
	}
	
	setTask = (id) => {
		return new Promise((resolve, reject) => {
			if (id === undefined) {
				this._task = new this._model();
				resolve(this._task);
			} else {
				this._model.findById(id).then((task) => {
					this._task = task;
					resolve(this._task);
				});
			}
		});
	}
	
	setTaskData = (data) => {
		return new Promise((resolve, reject) => {
			Object.assign(this._task,data);
			resolve(this._task);
		});
	}
	setNote = (note) => {
		return new Promise((resolve, reject) => {
			if (typeof this._task.notes !== 'object') this._task.notes = [];
			note.note_date = moment().tz('America/New_York');
			note.note_details = note.note_details || {};
			note.note_type = note.note_type || 'note';
			this._task.notes.unshift(note);
			resolve(this._task);
		});
	}
	
	find = (filter ={}, projection = null, options = {}) => {
		return new Promise((resolve, reject) => {
			this._model.find(filter, projection, options, (err, results) => {
				if (err) {
					reject(err);
				} else {
					resolve(results);
				}
			});
		})
	}
	
	findById = (id) => {
		return new Promise((resolve, reject) => {
			this._model.findById(id,(err, task) => {
				if(err) {
					reject(err);
				} else {
					resolve(task);
				}
			});
		})
	}
	
	findByIdAndUpdate = (id,data) => {
		return new Promise((resolve, reject) => {
			this._model.findByIdAndUpdate(id, data,(err, results) => {
				if (err) {
					reject(err);
				} else {
					resolve(results);
				}
			});
		});
	}
	
	getNext = (date) => {
		return new Promise((resolve, reject) => {
			this.find({task_date: date},"task_order",{sort:{task_order:-1},limit:1})
			.then((results) => resolve(results.length === 0 ? 1 : Number(results[0].task_order) + 1))
			.catch((err) => reject(err));
		});
	}
	
	deleteById = (id) => {
		return new Promise((resolve, reject) => {
			this._model.findByIdAndDelete(id, (err) => {
				if (err) {
					reject(err);
				} else {
					resolve(true);
				}
			});
		});
	}
	
	saveTask = () => {
		return new Promise((resolve, reject) => {
			this._task.save((err, task) => {
				if (err) {
					reject(err);
				} else {
					resolve(task);
				}
			});
		});
	}
	
	reorder = (tasks, base) => {
		const task = tasks.shift();
		if (task) {
			const task_order = Number(task.task_order);
			return this.findByIdAndUpdate(task.id,{task_order:task_order > base ? task_order - 1 : task_order + 1})
			.then((results) => {return this.reorder(tasks, base)})
			.catch((err) => reject(err));
		}
		return Promise.resolve(base);
	}
	
	forward	= (tasks, date) => {
		const task = tasks.shift();
		if (task) {
			return this.setTask(task._id)
			.then((task) => this.getNext(date))
			.then((task_order) => this.setTaskData({task_order:task_order}))
			.then((task) => this.setNote({note_type:'status',note:'forwarded',note_details:{from:this._task.task_date,to:date}}))
			.then((task) => this.setTaskData({task_date:date}))
			.then((task) => this.saveTask())
			.then((task) => {return this.forward(tasks, date)})
			.catch((err) => Promise.reject(err))
		}
		return Promise.resolve(true);
	}
	
	addTask = (data) => {		
		return new Promise((resolve, reject) => {
			data = {...data, ...{current_status:"in progress",creation_date:moment().tz('America/New_York').startOf('d'),completed:false,notes:[]}};
			this.setTask()
			.then((task) => this.getNext(new Date(data.task_date)))
			.then((task_order) => this.setTaskData({...data,...{task_order:task_order}}))
			.then((task) => this.saveTask())
			.then((task) => resolve(task))
			.catch((err) => resolve(err));
		});
	}
			
	updateTask = (id, data) => {
		return new Promise((resolve, reject) => {
			this.setTask(id)
			.then((task) => this.setTaskData(data))
			.then((task) => this.saveTask())
			.then((task) => resolve(task))
			.catch((err) => resolve(err));
		});
	}
	
	addNote = (id, note) => {
		return new Promise((resolve, reject) => {
			if (typeof note !== 'object') note = {note: note};
			this.setTask(id)
			.then((task) => this.setNote(note))
			.then((task) => this.saveTask())
			.then((task) => resolve(task))
			.catch((err) => reject(err));
		});
	}
	
	changeStatus = (id, status, details) => {
		return new Promise((resolve, reject) => {
			if (status === 'forwarded') {
				details.to = new Date(details.to);
				details.from = new Date(details.from);
			}
			this.setTask(id)
			.then((task) => this.setNote({note:status,note_details:details,note_type:'status'}))
			.then((task) => status === 'forwarded' ? this.find({task_date:this._task.task_date,task_order:{$gt:this._task.task_order}},'task_order') : Promise.resolve([]))
			.then((results) => this.reorder(results, this._task.task_order))
			.then((task) => this.setTaskData({task_date:status === 'forwarded' ? details.to : this._task.task_date,status : status === 'forwarded' ? this._task.status : status, completed: ['completed', 'deleted'].indexOf(status) > -1}))
			.then((task) => this.saveTask())
			.then((task) => resolve(task))
			.catch((err) => resolve(err));
		});
	}
	
	reorderTask = (id, task_order) => {
		return new Promise((resolve, reject) => {
			this.setTask(id)
			.then((task) => this.find({
				task_date:this._task.task_date,
				task_order:{
					$gte:Math.min(Number(this._task.task_order),Number(task_order)),
					$lte:Math.max(Number(this._task.task_order),Number(task_order))
				},
				_id:{$ne:id}},"task_order"))
			.then((results) => this.reorder(results, this._task.task_order))
			.then((results) => this.setTaskData({task_order: task_order}))
			.then((task) => this.saveTask())
			.then((results) => resolve(results))
			.catch((err) => reject(err));
		});
	}
	
	forwardTasks = (start_date, end_date, to_date) => {
		return new Promise((resolve, reject) => {
			this.find({task_date:{$gte:start_date,$lte:end_date}},"task_name",{sort:{task_order:1,task_date:1}})
			.then((tasks) => this.forward(tasks,to_date))
			.then((result) => {console.log('finished');resolve(true);})
			.catch((err) => {console.log(err);reject(err)});
		});		
	}
}

class TestTask extends Task {
	constructor() {
		super();
		this._model = require('./model/test-task');
	}
}

exports.Task = Task;
exports.TestTask = TestTask;