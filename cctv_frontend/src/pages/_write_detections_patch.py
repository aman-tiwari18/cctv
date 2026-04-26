import re

with open("/home/aman/Desktop/cctv/cctv_frontend/src/pages/ClientDetections.jsx", "r") as f:
    content = f.read()

# Replace 1: Add new state for examFilter
old_state = """const [search, setSearch] = useState('');"""
new_state = """const [search, setSearch] = useState('');
  const [examFilter, setExamFilter] = useState(searchParams.get('exam_id') || '');
  const [exams, setExams] = useState([]);"""
content = content.replace(old_state, new_state)

# Replace 2: Fetch exams inside ClientDetections
old_effect = """useEffect(() => {
    fetchClientImages(page, rowsPerPage);
  }, [typeFilter, dateFilter, page, rowsPerPage, appliedStartTime, appliedEndTime]);"""
new_effect = """useEffect(() => {
    fetchClientImages(page, rowsPerPage);
  }, [typeFilter, dateFilter, page, rowsPerPage, appliedStartTime, appliedEndTime, examFilter]);

  useEffect(() => {
    const fetchExams = async () => {
      try {
        // You might need to adjust the API call depending on your actual client exams endpoint. Let's use examsAPI.getAll for now.
        const res = await examsAPI.getAll({ is_active: true });
        if (res.data && res.data.data) {
          setExams(res.data.data);
        }
      } catch (err) {
        console.error("Failed to fetch exams:", err);
      }
    };
    fetchExams();
  }, []);"""
content = content.replace(old_effect, new_effect)

# Replace 3: Adding the examFilter logic to fetchClientImages
old_fetch = """if (dateFilter) {
        params.date = parseDateForQuery(dateFilter);
      }"""
new_fetch = """if (dateFilter) {
        params.date = parseDateForQuery(dateFilter);
      }
      if (examFilter) {
        params.exam_id = examFilter;
      }"""
content = content.replace(old_fetch, new_fetch)

# Replace 4: Adding the Select component next to the Search TextField
old_ui = """<TextField
          size="small"
          placeholder="Search center name , location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18, color: '#94a3b8' }} />
              </InputAdornment>
            ),
            sx: {
              borderRadius: '8px',
              bgcolor: '#f8fafc',
              height: 36,
              fontSize: 14,
              '& fieldset': { border: 'none' },
              '& input': { color: '#334155', '&::placeholder': { color: '#94a3b8', opacity: 1 } }
            }
          }}
          sx={{ minWidth: 200, maxWidth: 400, flex: 1 }}
        />"""
new_ui = """<TextField
          size="small"
          placeholder="Search center name , location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18, color: '#94a3b8' }} />
              </InputAdornment>
            ),
            sx: {
              borderRadius: '8px',
              bgcolor: '#f8fafc',
              height: 36,
              fontSize: 14,
              '& fieldset': { border: 'none' },
              '& input': { color: '#334155', '&::placeholder': { color: '#94a3b8', opacity: 1 } }
            }
          }}
          sx={{ minWidth: 200, maxWidth: 400, flex: 1 }}
        />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel sx={{ fontSize: 14 }}>Exam</InputLabel>
          <Select
            value={examFilter}
            label="Exam"
            onChange={(e) => setExamFilter(e.target.value)}
            sx={{
              borderRadius: '8px', bgcolor: '#f8fafc', height: 36, fontSize: 14,
              '& fieldset': { border: 'none' },
            }}
          >
            <MenuItem value="">
              <em>All Exams</em>
            </MenuItem>
            {exams.map((exam) => (
              <MenuItem key={exam.id} value={exam.id}>
                {exam.exam_name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>"""

# Replace 5: the InputLabel import and select and examsapi
old_imports = """import { useNavigate, useSearchParams } from 'react-router-dom';"""
new_imports = """import { useNavigate, useSearchParams } from 'react-router-dom';
import { examsAPI } from '../services/api';"""
content = content.replace(old_imports, new_imports)

old_mui_imports = """import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardMedia,"""
new_mui_imports = """import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardMedia,
  FormControl,
  Select,
  MenuItem,
  InputLabel,"""
content = content.replace(old_mui_imports, new_mui_imports)

content = content.replace(old_ui, new_ui)

with open("/home/aman/Desktop/cctv/cctv_frontend/src/pages/ClientDetections.jsx", "w") as f:
    f.write(content)
