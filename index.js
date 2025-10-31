
    // -------------------------
    // LOGIN / SIGNUP MANAGEMENT
    // -------------------------
    const loginScreen = document.getElementById('loginScreen');
    const appContainer = document.getElementById('appContainer');
    const formTitle = document.getElementById('formTitle');
    const errorMsg = document.getElementById('errorMsg');
    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const submitLogin = document.getElementById('submitLogin');
    const toggleLoginSignUp = document.getElementById('toggleLoginSignUp');
    const logoutBtn = document.getElementById('logoutBtn');

    // Users stored in localStorage as: { username: { passwordHash, otherData } }
    // For demo, we will store plain text password (NOT SECURE) — in real apps use hashing and backend
    let users = JSON.parse(localStorage.getItem('users_demo') || '{}');
    let currentUser = localStorage.getItem('currentUser_demo') || null;

    // Toggle form between Sign In and Sign Up
    let isLoginMode = true;

    function showError(msg) {
      errorMsg.textContent = msg;
    }
    function clearError() {
      errorMsg.textContent = '';
    }

    function switchMode() {
      isLoginMode = !isLoginMode;
      if (isLoginMode) {
        formTitle.textContent = 'Sign In';
        submitLogin.textContent = 'Sign In';
        toggleLoginSignUp.textContent = "Don't have an account? Sign Up";
        passwordInput.autocomplete = "current-password";
      } else {
        formTitle.textContent = 'Sign Up';
        submitLogin.textContent = 'Sign Up';
        toggleLoginSignUp.textContent = "Already have an account? Sign In";
        passwordInput.autocomplete = "new-password";
      }
      clearError();
      usernameInput.value = '';
      passwordInput.value = '';
    }

    toggleLoginSignUp.onclick = switchMode;

    // Simple validation
    function validateCredentials(username, password) {
      if (!username) return 'Username is required';
      if (!password) return 'Password is required';
      if (username.length < 3) return 'Username must be at least 3 characters';
      if (password.length < 4) return 'Password must be at least 4 characters';
      return null;
    }

    // Handle login or signup submit
    submitLogin.onclick = () => {
      clearError();
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      const err = validateCredentials(username, password);
      if (err) {
        showError(err);
        return;
      }

      if (isLoginMode) {
        // Login
        if (!users[username]) {
          showError('User not found. Please sign up.');
          return;
        }
        if (users[username].password !== password) {
          showError('Incorrect password');
          return;
        }
        currentUser = username;
        localStorage.setItem('currentUser_demo', currentUser);
        loadAppForUser(currentUser);
      } else {
        // Sign up
        if (users[username]) {
          showError('Username already taken');
          return;
        }
        // Save new user
        users[username] = {
          password: password,
          // you could add more profile info here
        };
        localStorage.setItem('users_demo', JSON.stringify(users));
        currentUser = username;
        localStorage.setItem('currentUser_demo', currentUser);
        loadAppForUser(currentUser);
      }
    };

    logoutBtn.onclick = () => {
      currentUser = null;
      localStorage.removeItem('currentUser_demo');
      loginScreen.classList.remove('hidden');
      appContainer.classList.add('hidden');
      switchMode(); // reset form to Sign In
      stopCamera();
    };

    // -------------------------
    // MAIN APP LOGIC
    // -------------------------
    const video = document.getElementById('video');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const captureBtn = document.getElementById('captureBtn');
    const recognizeBtn = document.getElementById('recognizeBtn');
    const statusDiv = document.getElementById('status');
    const snapshotImg = document.getElementById('snapshot');
    const attendanceTableBody = document.querySelector('#attendanceTable tbody');

    const studentNameInput = document.getElementById('studentName');
    const studentIdInput = document.getElementById('studentId');
    const addStudentBtn = document.getElementById('addStudentBtn');
    const createStudentBtn = document.getElementById('createStudentBtn');
    const importStudentsInput = document.getElementById('importStudents');
    const exportStudentsBtn = document.getElementById('exportStudentsBtn');

    const studentsListDiv = document.getElementById('studentsList');
    const exportCSVBtn = document.getElementById('exportCSV');
    const clearAttendanceBtn = document.getElementById('clearAttendance');

    // Per user data keys in localStorage
    function studentsKey(user) { return `students_${user}`; }
    function attendanceKey(user) { return `attendance_${user}`; }

    // State variables
    let stream = null;
    let snapshotDataUrl = null;

    // User-specific students and attendance
    let students = [];
    let attendance = [];

    function setStatus(text) {
      statusDiv.textContent = 'Status: ' + text;
    }

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        video.srcObject = stream;
        await video.play();
        setStatus('Camera started');
      } catch (err) {
        setStatus('Camera error: ' + err.message);
      }
    }

    function stopCamera() {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
        setStatus('Camera stopped');
      }
    }

    function captureSnapshot() {
      if (!video || !stream) {
        setStatus('Camera not started');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      snapshotDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      snapshotImg.src = snapshotDataUrl;
      setStatus('Snapshot taken');
    }

    function getAverageColorFromDataUrl(dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = 8;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, size, size);
          const imageData = ctx.getImageData(0, 0, size, size).data;
          let r = 0, g = 0, b = 0, count = 0;
          for (let i = 0; i < imageData.length; i += 4) {
            r += imageData[i];
            g += imageData[i + 1];
            b += imageData[i + 2];
            count++;
          }
          resolve([r / count, g / count, b / count]);
        };
        img.onerror = () => reject(new Error('Image load error'));
        img.src = dataUrl;
      });
    }

    function colorDistance(c1, c2) {
      return Math.sqrt(
        (c1[0] - c2[0]) ** 2 +
        (c1[1] - c2[1]) ** 2 +
        (c1[2] - c2[2]) ** 2
      );
    }

    async function recognizeStudent() {
      if (!snapshotDataUrl) {
        setStatus('Take a snapshot first');
        return;
      }
      setStatus('Recognizing...');
      try {
        const snapshotColor = await getAverageColorFromDataUrl(snapshotDataUrl);

        let bestMatch = null;
        let bestDistance = Infinity;

        for (const stu of students) {
          if (!stu.fingerprint) continue;
          const dist = colorDistance(snapshotColor, stu.fingerprint);
          if (dist < bestDistance) {
            bestDistance = dist;
            bestMatch = stu;
          }
        }

        if (bestMatch && bestDistance < 50) {
          // Mark attendance
          const now = new Date().toLocaleString();
          attendance.push({ id: bestMatch.id, name: bestMatch.name, time: now, method: 'Naive color match' });
          saveAttendance();
          renderAttendance();
          setStatus(`Recognized: ${bestMatch.name}`);
        } else {
          setStatus('No match found');
        }
      } catch (err) {
        setStatus('Recognition error: ' + err.message);
      }
    }

    // Save/load functions
    function saveStudents() {
      if (currentUser) {
        localStorage.setItem(studentsKey(currentUser), JSON.stringify(students));
      }
    }

    function loadStudents() {
      if (currentUser) {
        const saved = localStorage.getItem(studentsKey(currentUser));
        students = saved ? JSON.parse(saved) : [];
      }
    }

    function saveAttendance() {
      if (currentUser) {
        localStorage.setItem(attendanceKey(currentUser), JSON.stringify(attendance));
      }
    }

    function loadAttendance() {
      if (currentUser) {
        const saved = localStorage.getItem(attendanceKey(currentUser));
        attendance = saved ? JSON.parse(saved) : [];
      }
    }

    // Render functions
    function renderStudents() {
      studentsListDiv.innerHTML = '';
      if (students.length === 0) {
        studentsListDiv.textContent = 'No students added yet.';
        return;
      }
      for (const stu of students) {
        const div = document.createElement('div');
        div.className = 'student';

        const imgDiv = document.createElement('div');
        imgDiv.className = 'stu-img';

        // Show fingerprint color as background if no photo
        if (stu.fingerprintColor) {
          imgDiv.style.backgroundColor = stu.fingerprintColor;
        } else {
          imgDiv.textContent = '?';
          imgDiv.style.color = '#666';
          imgDiv.style.fontSize = '24px';
          imgDiv.style.fontWeight = 'bold';
          imgDiv.style.display = 'flex';
          imgDiv.style.justifyContent = 'center';
          imgDiv.style.alignItems = 'center';
        }

        div.appendChild(imgDiv);

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = `<strong>${stu.name}</strong> (ID: ${stu.id})`;

        div.appendChild(infoDiv);

        studentsListDiv.appendChild(div);
      }
    }

    function renderAttendance() {
      attendanceTableBody.innerHTML = '';
      if (attendance.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = 'No attendance records.';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        attendanceTableBody.appendChild(tr);
        return;
      }
      for (const att of attendance) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${att.id}</td>
          <td>${att.name}</td>
          <td>${att.time}</td>
          <td>${att.method}</td>
        `;
        attendanceTableBody.appendChild(tr);
      }
    }

    // Add student (placeholder fingerprint from snapshot color)
    addStudentBtn.onclick = async () => {
      const name = studentNameInput.value.trim();
      const id = studentIdInput.value.trim();
      if (!name || !id) {
        alert('Enter student name and ID');
        return;
      }
      if (!snapshotDataUrl) {
        alert('Capture a snapshot to use as fingerprint color');
        return;
      }
      try {
        const fingerprint = await getAverageColorFromDataUrl(snapshotDataUrl);
        const fingerprintColor = `rgb(${Math.round(fingerprint[0])},${Math.round(fingerprint[1])},${Math.round(fingerprint[2])})`;

        students.push({ name, id, fingerprint, fingerprintColor });
        saveStudents();
        renderStudents();

        // Clear inputs
        studentNameInput.value = '';
        studentIdInput.value = '';
        setStatus(`Added student ${name}`);
      } catch (err) {
        setStatus('Error adding student: ' + err.message);
      }
    };

    createStudentBtn.onclick = () => {
      const name = studentNameInput.value.trim();
      const id = studentIdInput.value.trim();
      if (!name || !id) {
        alert('Enter student name and ID');
        return;
      }
      students.push({ name, id, fingerprint: null, fingerprintColor: null });
      saveStudents();
      renderStudents();
      studentNameInput.value = '';
      studentIdInput.value = '';
      setStatus(`Created student ${name} (no image)`);
    };

    importStudentsInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (Array.isArray(imported)) {
            students = imported;
            saveStudents();
            renderStudents();
            setStatus('Imported students');
          } else {
            alert('Invalid file format');
          }
        } catch (e) {
          alert('Error parsing JSON');
        }
      };
      reader.readAsText(file);
      importStudentsInput.value = '';
    };

    exportStudentsBtn.onclick = () => {
      const dataStr = JSON.stringify(students, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'students.json';
      a.click();
      URL.revokeObjectURL(url);
    };

    exportCSVBtn.onclick = () => {
      if (attendance.length === 0) {
        alert('No attendance to export');
        return;
      }
      let csv = 'ID,Name,Time,Method\n';
      attendance.forEach(rec => {
        csv += `"${rec.id}","${rec.name}","${rec.time}","${rec.method}"\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'attendance.csv';
      a.click();
      URL.revokeObjectURL(url);
    };

    clearAttendanceBtn.onclick = () => {
      if (confirm('Clear all attendance records?')) {
        attendance = [];
        saveAttendance();
        renderAttendance();
        setStatus('Attendance cleared');
      }
    };

    startBtn.onclick = startCamera;
    stopBtn.onclick = stopCamera;
    captureBtn.onclick = captureSnapshot;
    recognizeBtn.onclick = recognizeStudent;

    // Load user data and show app
    function loadAppForUser(user) {
      loginScreen.classList.add('hidden');
      appContainer.classList.remove('hidden');
      setStatus('Logged in as ' + user);

      // Load per-user data
      loadStudents();
      loadAttendance();

      renderStudents();
      renderAttendance();
    }

    // On page load: if user logged in, show app
    if (currentUser && users[currentUser]) {
      loadAppForUser(currentUser);
    } else {
      // Show login screen
      loginScreen.classList.remove('hidden');
      appContainer.classList.add('hidden');
    }
  