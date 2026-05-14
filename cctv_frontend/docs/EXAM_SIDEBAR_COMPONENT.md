# Reusable Exam Sidebar Component

## Overview

Created a reusable `ExamSidebar` component to replace the duplicated sidebar code across multiple pages (Cameras, Schedule Analytics, Executions, etc.).

## Files Created

### `cctv_frontend/src/components/ExamSidebar.jsx`

A fully reusable collapsible sidebar component with the following features:

**Props:**
- `open` (boolean) - Whether sidebar is expanded or collapsed
- `onToggle` (function) - Callback when toggle button is clicked
- `exams` (array) - Array of exam objects to display
- `selectedExamId` (string|number) - Currently selected exam ID
- `onSelectExam` (function) - Callback when an exam is selected
- `viewingArchived` (boolean) - Whether viewing archived exams
- `onToggleArchived` (function) - Callback for archive toggle button
- `title` (string, optional) - Custom title (defaults to "Available Exams" / "Archived Exams")
- `icon` (ReactNode, optional) - Custom icon component (defaults to ExamsSvgIcon)

**Features:**
- ✅ Smooth collapse/expand animation (280px → 56px)
- ✅ Shows first letter of exam name when collapsed
- ✅ Active exam highlighting with blue accent
- ✅ Hover states and tooltips
- ✅ Archive toggle button (optional)
- ✅ Empty state message
- ✅ Fully customizable via props

## Files Modified

### `cctv_frontend/src/pages/Cameras.jsx`

**Changes:**
1. Imported `ExamSidebar` component
2. Replaced 100+ lines of sidebar code with single component usage
3. Removed unused imports: `ChevronRight`, `KeyboardArrowLeft`, `KeyboardArrowRight`, `ExamsSvgIcon`

**Before (100+ lines):**
```jsx
<Box sx={{ width: sidebarOpen ? 280 : 56, ... }}>
  {/* Sidebar header + collapse toggle */}
  <Box sx={{ px: sidebarOpen ? 2.5 : 1, ... }}>
    {/* ... 100+ lines of sidebar code ... */}
  </Box>
</Box>
```

**After (10 lines):**
```jsx
<ExamSidebar
  open={sidebarOpen}
  onToggle={() => setSidebarOpen(!sidebarOpen)}
  exams={exams}
  selectedExamId={selectedExamId}
  onSelectExam={setSelectedExamId}
  viewingArchived={viewingArchived}
  onToggleArchived={() => {
    setViewingArchived(!viewingArchived);
    setSelectedExamId('');
  }}
/>
```

## Usage Example

```jsx
import ExamSidebar from '../components/ExamSidebar';

function MyPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [viewingArchived, setViewingArchived] = useState(false);

  return (
    <Box sx={{ display: 'flex' }}>
      <ExamSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        exams={exams}
        selectedExamId={selectedExamId}
        onSelectExam={setSelectedExamId}
        viewingArchived={viewingArchived}
        onToggleArchived={() => {
          setViewingArchived(!viewingArchived);
          setSelectedExamId('');
        }}
      />
      
      {/* Main content */}
      <Box sx={{ flex: 1 }}>
        {/* Your page content */}
      </Box>
    </Box>
  );
}
```

## Next Steps

Apply this component to other pages that use the same sidebar pattern:

### 1. Schedule Analytics Page
- Replace sidebar code with `<ExamSidebar />`
- Remove duplicate sidebar implementation

### 2. Executions Page
- Replace sidebar code with `<ExamSidebar />`
- Remove duplicate sidebar implementation

### 3. Any other pages with exam selection sidebar
- Use the same pattern as shown above

## Benefits

✅ **Code Reusability**: Single source of truth for sidebar behavior
✅ **Maintainability**: Changes to sidebar only need to be made once
✅ **Consistency**: All pages have identical sidebar behavior and styling
✅ **Reduced Bundle Size**: ~100 lines of code removed per page
✅ **Easier Testing**: Test sidebar once, works everywhere
✅ **Customizable**: Props allow for page-specific customization

## Design Specifications

### Expanded State (280px width)
- Full exam name and body displayed
- Toggle button on the right
- Archive toggle button at bottom
- Smooth transitions

### Collapsed State (56px width)
- First letter of exam name in styled box
- Centered toggle button
- Tooltips show full exam name on hover
- Archive button hidden

### Active State
- Blue left border (3px)
- Light blue background (#f0f6ff)
- Blue text color (#3b82f6)
- Blue chevron icon

### Hover State
- Light gray background (#f8fafc) for inactive items
- Maintains active styling for selected item

## Styling Tokens

```js
{
  width: { expanded: 280, collapsed: 56 },
  colors: {
    border: '#e8ecf1',
    background: '#fff',
    active: '#f0f6ff',
    hover: '#f8fafc',
    primary: '#3b82f6',
    text: '#334155',
    textMuted: '#64748b',
  },
  transition: '0.22s cubic-bezier(0.4,0,0.2,1)',
}
```
