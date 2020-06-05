const { Task, TestTask } = require('./task.js');
const Pusher = require('./pusher');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const moment = require('moment');
require('moment-timezone');

const promptQuestion = (question) => {
	return new Promise((resolve, reject) => {
		readline.question(question, value => {
			resolve(value);
		});
	});
}

const getValues = (fields, values = {}) => {
	const field = fields.shift();
	if (field) {
		return promptQuestion(`Enter ${field}: `).then((value) => {
			values[field] = value;
			return getValues(fields, values);
		});
	}
	
	return Promise.resolve(values);
//return new Promise((resolve,reject) => {resolve({'start':-1,'days':2,'repeat':3});})
}

const createTasks = (obj, tasks, ids) => {
	const task = tasks.shift();
	const id = ids.shift();
	if (task) {
		return obj.setTask(id)
		.then((result) => obj.setTaskData(task))
		.then((result) => obj.saveTask())
		.then((result) => { return createTasks(obj,tasks,ids);})
		.catch((err) => Promise.reject(err));
	} else if (id) {
		return obj.deleteById(id._id).then((results) => {return createTasks(obj, tasks, ids);}).catch((err) => reject(err));
	}
	
	return Promise.resolve(true);
}

setTimeout(() => {getValues(['start','days','repeat']).then((values) => {
//	readline.close();
	const uncompleted = ['in progress','delegated','forwarded'];
	const completed = ['deleted','completed'];
	const tasks = [];
	const triggers = {};
	const notes = [];
	const note = {
		note_type: 'note',
		note_date: moment().add(values.start - 1, 'day').tz('America/New_York').startOf('d'),
		note_details: {}
	};

	for (let n = 1;n <= 3;n++) {
		notes.push({...note,...{note: `Note ${n}`}});
	}
	const objTask = new TestTask();
	const pusher = new Pusher();

	for (let d = values.start;d < Number(values.days) + Number(values.start); d++) {
		const date = moment().add(d,'day').tz('America/New_York').startOf('d');
		triggers[date] = ['uncompleted'];
		for (let i = 0;i < (d === 0 ? uncompleted.length * values.repeat : uncompleted.length);i++) {
			const task = {
				task_order : i + 1, 
				task_name: `Task ${i + 1} ${date.format('MM/DD/YYYY')}`,
				completed:false,
				forwarded: uncompleted[i%3] === 'forwarded',
				current_status: uncompleted[i%3] === 'forwarded' ? 'in progress' : uncompleted[i%3],
				task_date: date,
				creation_date: moment().tz('America/New_York')
			}
			task.task_details = `These are the details for ${task.task_name}`;
			switch (uncompleted[i%3]) {
				case "delegated":
					task.notes = [...[{...{note_type:'status',note:'delegated',note_details:{to:'Bob'}},...note}],...notes];
				break
				case "forwarded":
					task.notes = [...[{...{note_type:'status',note:'forwarded',note_details:{to:date,from:moment().tz('America/New_York')}},...note}],...notes];
				break;
				default:
					task.notes = notes;
				break;
			}
			tasks.push(task);
		}
		if (d <= 0) {
			triggers[date].push('completed');
			for (let i = 0;i < (d === 0 ? completed.length * values.repeat : completed.length);i++) {
				const task = {
					task_order : i + (d===0 ? values.repeat * uncompleted.length : uncompleted.length) + 1, 
					completed:true,
					forwarded: false,
					current_status: completed[i%3],
					task_date: date,
					creation_date: moment().tz('America/New_York'),
					notes: [...[{...{note_type:'status',note:completed[i]},...notes}],...notes]
				}
				task.task_name = `Task ${task.task_order} ${date.format('MM/DD/YYYY')}`,
				task.task_details = `These are the details for ${task.task_name}`;
				tasks.push(task);
			}
		}
	}
	objTask.find({},{_id: 1})
	.then((results) => createTasks(objTask,tasks,results))
	.then((task)=>pusher.trigger('tasks','update',triggers))
	.then((results) => console.log('tasks created'))
	.catch((err) => console.log(err));
});},5000);