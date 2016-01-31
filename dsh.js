/**
 * DSH v1.0.0 31/01/2016
 *
 * Copyright (c) 2016, Robert Eisele (robert@xarg.org)
 * Dual licensed under the MIT or GPL Version 2 licenses.
 **/

(function() {

  var fs = require('fs');
  var EventEmitter = require('events');
  var util = require('util');
  var LineByLineReader = require('line-by-line');

  require('keypress')(process.stdin);

  var options = {
    'ps': '>> ',
    'useAlert': true,
    'exitOnCtrlC': true,
    'abortOnCtrlC': false,
    'historyPath': null,
    'historyLimit': null
  };

  var cmd = "";
  var histndx = 0;
  var history = [];
  var cursor = 0;
  var lockedHistory = true;

  function writeHistory() {

    var fd, i = 0;

    if (options.historyPath && history.length > 0) {

      try {
        fd = fs.openSync(options.historyPath, 'w+');
      } catch (e) {
        process.stdout.write("\n\033[0;31mCan't write history file " + options.historyPath + "\033[0m");
        return;
      }

      if (options.historyLimit !== null) {
        i = Math.max(0, history.length - options.historyLimit);
      }

      for (; i < history.length; i++) {

        fs.writeSync(fd, history[i] + "\n");
      }
      fs.closeSync(fd);
    }
  }

  function readHistory() {

    if (options.historyPath) {

      // Read async to speed up the startup
      var lr = new LineByLineReader(options.historyPath);

      lr.on('error', function() {
        lockedHistory = false;
      });

      lr.on('end', function() {
        lockedHistory = false;
      });

      lr.on('line', function(line) {
        history.push(line);
        histndx++;
      });

    } else {
      lockedHistory = false;
    }
  }

  function alert() {

    if (options.useAlert) {
      process.stdout.write('\x07');
    }
  }

  function setCursor(num) {

    if (num === 0) {

    } else if (num < 0) {
      process.stdout.write("\033[" + (-num) + "D");
    } else {
      process.stdout.write("\033[" + num + "C");
    }
  }

  function deleteRestOfLine() {
    process.stdout.write('\033[K');
  }

  function DSH() {
    EventEmitter.call(this);
  }
  util.inherits(DSH, EventEmitter);

  DSH.prototype.write = function(str) {
    process.stdout.write(str);
  };

  DSH.prototype.setOptions = function(key, value) {

    if (value === undefined) {

      if (util.isObject(key)) {

        for (var i in key) {
          if (options.hasOwnProperty(i)) {
            options[i] = key[i];
          }
        }
      }

    } else {
      options[key] = value;
    }
  };

  DSH.prototype.open = function() {

    // Delete function, as it is allowed to call it only once
    DSH.prototype.open = undefined;

    readHistory();

    // Set up stdin
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    this.emit('open');

    // Show the prompt
    this.write(options.ps);

    var self = this;

    process.stdin.on('keypress', function(ch, key) {

      if (key) {

        if (key.ctrl && key.name === 'c') {

          if (options.exitOnCtrlC) {
            self.exit();
          } else if (options.abortOnCtrlC) {

            // Write a new line
            self.write("\n");

            // Set the cursor to the beginning
            cursor = 0;

            // Clear the current command
            cmd = "";

            // Show prompt again
            self.write(options.ps);
          }
          return;
        }

        switch (key.name) {

          case 'return':

            // Go to the next line
            self.write("\n");

            // Get back to the user
            self.emit('exec', cmd);

            // Clear state
            cmd = "";
            cursor = 0;

            // Show prompt again
            self.write(options.ps);
            return;


          case 'up':
          case 'down':

            if (lockedHistory) {
              // It's still locked, because history file is still being read
              alert();
              return;
            }


            return;

          case 'left':

            var col = cursor - 1;

            if (col < 0) {
              alert();
            } else {
              cursor = col;
              setCursor(-1);
            }
            return;

          case 'right':

            var col = cursor + 1;

            if (col > cmd.length) {
              alert();
            } else {
              cursor = col;
              setCursor(+1);
            }
            return;

          case 'backspace':

            if (cmd.length === 0) {
              alert();
              return;
            }

            // Go one step back
            setCursor(-1);

            // Write the rest of the line
            self.write(cmd.slice(cursor));

            // Clear the remaining char on the right
            deleteRestOfLine();

            // Set cursor back to the right place
            setCursor(cursor - cmd.length);

            // Maintain internal state
            cursor--;
            cmd = cmd.slice(0, cursor) + cmd.slice(cursor + 1);
            return;

          case 'escape':
            // Ignore
            return;
        }
      }

      // Write the new character
      self.write(ch);

      // Write the rest of the line if we're in the middle of a command
      if (cursor < cmd.length) {
        self.write(cmd.slice(cursor));
        setCursor(cursor - cmd.length);
      }

      // Add char to the command
      cmd = cmd.slice(0, cursor) + ch + cmd.slice(cursor);

      // Move cursor
      cursor += ch.length;

    });
  };

  DSH.prototype.exit = function() {

    writeHistory();

    // Write a new line
    this.write('\n');

    this.emit('exit');
    process.exit();
  };

  DSH.prototype.history = history;

  module.exports = new DSH;

})();