# import os
# import shutil
# import re
# from datetime import datetime

# SOURCE_FOLDER = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_detections"
# DEST_ROOT = os.path.join(SOURCE_FOLDER, "proof_of_work")

# timestamp_pattern = re.compile(r'_(\d{8})_(\d{6})_')

# def get_shift(time_str):

#     t = datetime.strptime(time_str, "%H%M%S").time()

#     shift1_start = datetime.strptime("09:00:00", "%H:%M:%S").time()
#     shift1_end   = datetime.strptime("10:30:00", "%H:%M:%S").time()

#     shift2_start = datetime.strptime("12:30:00", "%H:%M:%S").time()
#     shift2_end   = datetime.strptime("14:00:00", "%H:%M:%S").time()

#     shift3_start = datetime.strptime("16:00:00", "%H:%M:%S").time()
#     shift3_end   = datetime.strptime("17:30:00", "%H:%M:%S").time()

#     if shift1_start <= t <= shift1_end:
#         return "shift1"

#     elif shift2_start <= t <= shift2_end:
#         return "shift2"

#     elif shift3_start <= t <= shift3_end:
#         return "shift3"

#     else:
#         return None


# def main():

#     today = datetime.now().strftime("%Y-%m-%d")
#     today_folder = os.path.join(DEST_ROOT, today)

#     shifts = ["shift1", "shift2", "shift3"]

#     for shift in shifts:
#         os.makedirs(os.path.join(today_folder, shift), exist_ok=True)

#     for detection_type in os.listdir(SOURCE_FOLDER):

#         detection_path = os.path.join(SOURCE_FOLDER, detection_type)

#         if not os.path.isdir(detection_path):
#             continue

#         if detection_type == "proof_of_work":
#             continue

#         print(f"Processing {detection_type}")

#         for file in os.listdir(detection_path):

#             if not file.lower().endswith((".jpg", ".jpeg", ".png")):
#                 continue

#             match = timestamp_pattern.search(file)

#             if not match:
#                 continue

#             date_str = match.group(1)
#             time_str = match.group(2)

#             shift = get_shift(time_str)

#             if shift is None:
#                 continue

#             dest_folder = os.path.join(
#                 today_folder,
#                 shift,
#                 detection_type
#             )

#             os.makedirs(dest_folder, exist_ok=True)

#             src = os.path.join(detection_path, file)
#             dst = os.path.join(dest_folder, file)

#             shutil.copy2(src, dst)

#     print("\n✅ Proof of work created successfully")


# if __name__ == "__main__":
#     main()







# import os
# import shutil
# import re
# from datetime import datetime

# SOURCE_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_detections"
# DEST_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/proof_of_work"

# VALID_FOLDERS = [
#     "crowd_detection",
#     "entry_exit_detection",
#     "intruder_detection",
#     "invigilator_detection",
#     "phone_detection",
#     "proximity_detection",
#     "server_room_detection"
# ]

# timestamp_pattern = re.compile(r'_(\d{8})_(\d{6})_')


# def get_shift(time_str):

#     t = datetime.strptime(time_str, "%H%M%S").time()

#     shift1_start = datetime.strptime("09:00:00", "%H:%M:%S").time()
#     shift1_end   = datetime.strptime("10:30:00", "%H:%M:%S").time()

#     shift2_start = datetime.strptime("12:30:00", "%H:%M:%S").time()
#     shift2_end   = datetime.strptime("14:00:00", "%H:%M:%S").time()

#     shift3_start = datetime.strptime("16:00:00", "%H:%M:%S").time()
#     shift3_end   = datetime.strptime("17:30:00", "%H:%M:%S").time()

#     if shift1_start <= t <= shift1_end:
#         return "shift1"

#     if shift2_start <= t <= shift2_end:
#         return "shift2"

#     if shift3_start <= t <= shift3_end:
#         return "shift3"

#     return None


# def main():

#     today = datetime.now().strftime("%Y-%m-%d")
#     today_folder = os.path.join(DEST_ROOT, today)

#     os.makedirs(today_folder, exist_ok=True)

#     for folder in VALID_FOLDERS:

#         src_folder = os.path.join(SOURCE_ROOT, folder)

#         if not os.path.exists(src_folder):
#             continue

#         print(f"Processing {folder}")

#         for file in os.listdir(src_folder):

#             if not file.lower().endswith((".jpg", ".jpeg", ".png")):
#                 continue

#             match = timestamp_pattern.search(file)

#             if not match:
#                 continue

#             time_str = match.group(2)

#             shift = get_shift(time_str)

#             if shift is None:
#                 continue

#             dest_folder = os.path.join(
#                 today_folder,
#                 shift,
#                 folder
#             )

#             os.makedirs(dest_folder, exist_ok=True)

#             src = os.path.join(src_folder, file)
#             dst = os.path.join(dest_folder, file)

#             shutil.copy2(src, dst)

#     print("\n✅ Proof of work generated successfully")


# if __name__ == "__main__":
#     main()









# import os
# import shutil
# import re
# from datetime import datetime

# SOURCE_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_detections"
# DEST_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/proof_of_work"

# VALID_FOLDERS = [
#     "crowd_detection",
#     "entry_exit_detection",
#     "intruder_detection",
#     "invigilator_detection",
#     "invigilator_tracking",
#     "phone_detection",
#     "proximity_detection",
#     "server_room_detection"
# ]

# timestamp_pattern = re.compile(r'_(\d{8})_(\d{6})_')


# def get_shift(time_str):

#     t = datetime.strptime(time_str, "%H%M%S").time()

#     shift1_start = datetime.strptime("09:00:00", "%H:%M:%S").time()
#     shift1_end   = datetime.strptime("10:30:00", "%H:%M:%S").time()

#     shift2_start = datetime.strptime("12:30:00", "%H:%M:%S").time()
#     shift2_end   = datetime.strptime("14:00:00", "%H:%M:%S").time()

#     shift3_start = datetime.strptime("16:00:00", "%H:%M:%S").time()
#     shift3_end   = datetime.strptime("17:30:00", "%H:%M:%S").time()

#     if shift1_start <= t <= shift1_end:
#         return "shift1"

#     if shift2_start <= t <= shift2_end:
#         return "shift2"

#     if shift3_start <= t <= shift3_end:
#         return "shift3"

#     return None


# def main():

#     today = datetime.now().strftime("%Y-%m-%d")
#     today_folder = os.path.join(DEST_ROOT, today)

#     os.makedirs(today_folder, exist_ok=True)

#     for folder in VALID_FOLDERS:

#         src_folder = os.path.join(SOURCE_ROOT, folder)

#         if not os.path.exists(src_folder):
#             continue

#         print(f"Processing {folder}")

#         for root, dirs, files in os.walk(src_folder):

#             for file in files:

#                 if not file.lower().endswith((".jpg", ".jpeg", ".png")):
#                     continue

#                 match = timestamp_pattern.search(file)

#                 if not match:
#                     continue

#                 time_str = match.group(2)

#                 shift = get_shift(time_str)

#                 if shift is None:
#                     continue

#                 dest_folder = os.path.join(
#                     today_folder,
#                     shift,
#                     folder
#                 )

#                 os.makedirs(dest_folder, exist_ok=True)

#                 src = os.path.join(root, file)
#                 dst = os.path.join(dest_folder, file)

#                 shutil.copy2(src, dst)

#     print("\n✅ Proof of work generated successfully")


# if __name__ == "__main__":
#     main()













# import os
# import shutil
# import re
# from datetime import datetime

# SOURCE_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_detections"
# DEST_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/proof_of_work"

# VALID_FOLDERS = [
#     "crowd_detection",
#     "entry_exit_detection",
#     "intruder_detection",
#     "invigilator_detection",
#     "invigilator_tracking",
#     "phone_detection",
#     "proximity_detection",
#     "server_room_detection",
#     "crowd_det_zero",
#     "crowd_detection_threshold"
# ]

# SHIFTS = ["shift1", "shift2", "shift3"]

# timestamp_pattern = re.compile(r'_(\d{8})_(\d{6})_')


# def get_shift(time_str):

#     t = datetime.strptime(time_str, "%H%M%S").time()

#     shift1_start = datetime.strptime("09:00:00", "%H:%M:%S").time()
#     shift1_end   = datetime.strptime("10:30:00", "%H:%M:%S").time()

#     shift2_start = datetime.strptime("12:30:00", "%H:%M:%S").time()
#     shift2_end   = datetime.strptime("14:00:00", "%H:%M:%S").time()

#     shift3_start = datetime.strptime("16:00:00", "%H:%M:%S").time()
#     shift3_end   = datetime.strptime("17:30:00", "%H:%M:%S").time()

#     if shift1_start <= t <= shift1_end:
#         return "shift1"

#     if shift2_start <= t <= shift2_end:
#         return "shift2"

#     if shift3_start <= t <= shift3_end:
#         return "shift3"

#     return None


# def create_base_structure(today_folder):

#     for shift in SHIFTS:
#         for folder in VALID_FOLDERS:
#             path = os.path.join(today_folder, shift, folder)
#             os.makedirs(path, exist_ok=True)


# def main():

#     today = datetime.now().strftime("%Y-%m-%d")
#     today_folder = os.path.join(DEST_ROOT, today)

#     # Create all folders first
#     create_base_structure(today_folder)

#     for folder in VALID_FOLDERS:

#         src_folder = os.path.join(SOURCE_ROOT, folder)

#         if not os.path.exists(src_folder):
#             continue

#         print(f"Processing {folder}")

#         for root, dirs, files in os.walk(src_folder):

#             for file in files:

#                 if not file.lower().endswith((".jpg", ".jpeg", ".png")):
#                     continue

#                 match = timestamp_pattern.search(file)

#                 if not match:
#                     continue

#                 time_str = match.group(2)

#                 shift = get_shift(time_str)

#                 if shift is None:
#                     continue

#                 src = os.path.join(root, file)
#                 dst = os.path.join(today_folder, shift, folder, file)

#                 shutil.copy2(src, dst)

#     print("\n✅ Proof of work generated successfully")


# if __name__ == "__main__":
#     main()


















#working for current day
# import os
# import shutil
# import re
# from datetime import datetime

# SOURCE_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_detections"
# DEST_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/proof_of_work"

# VALID_FOLDERS = [
#     "crowd_detection",
#     "entry_exit_detection",
#     "intruder_detection",
#     "invigilator_detection",
#     "invigilator_tracking",
#     "phone_detection",
#     "proximity_detection",
#     "server_room_detection",
#     "crowd_det_zero",
#     "crowd_detection_threshold"
# ]

# SHIFTS = ["shift1", "shift2", "shift3"]

# timestamp_pattern = re.compile(r'_(\d{8})_(\d{6})_')


# def get_shift(time_str):

#     t = datetime.strptime(time_str, "%H%M%S").time()

#     if datetime.strptime("09:00:00","%H:%M:%S").time() <= t <= datetime.strptime("10:30:00","%H:%M:%S").time():
#         return "shift1"

#     if datetime.strptime("12:30:00","%H:%M:%S").time() <= t <= datetime.strptime("14:00:00","%H:%M:%S").time():
#         return "shift2"

#     if datetime.strptime("16:00:00","%H:%M:%S").time() <= t <= datetime.strptime("17:30:00","%H:%M:%S").time():
#         return "shift3"

#     return None


# def create_base_structure(today_folder):

#     for shift in SHIFTS:
#         for folder in VALID_FOLDERS:
#             os.makedirs(os.path.join(today_folder, shift, folder), exist_ok=True)


# def main():

#     today_date = datetime.now().strftime("%Y-%m-%d")
#     today_str = datetime.now().strftime("%Y%m%d")

#     today_folder = os.path.join(DEST_ROOT, today_date)

#     create_base_structure(today_folder)

#     for folder in VALID_FOLDERS:

#         src_folder = os.path.join(SOURCE_ROOT, folder)

#         if not os.path.exists(src_folder):
#             continue

#         print(f"Processing {folder}")

#         for root, dirs, files in os.walk(src_folder):

#             for file in files:

#                 if not file.lower().endswith((".jpg",".jpeg",".png")):
#                     continue

#                 match = timestamp_pattern.search(file)

#                 if not match:
#                     continue

#                 date_str = match.group(1)
#                 time_str = match.group(2)

#                 # Only today's images
#                 if date_str != today_str:
#                     continue

#                 shift = get_shift(time_str)

#                 if shift is None:
#                     continue

#                 src = os.path.join(root,file)
#                 dst = os.path.join(today_folder,shift,folder,file)

#                 shutil.copy2(src,dst)

#     print("\n✅ Proof of work created for today")


# if __name__ == "__main__":
#     main()










#working for a particular day as well as current day (if no date provided)
# import os
# import shutil
# import re
# import sys
# from datetime import datetime

# SOURCE_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_detections"
# DEST_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/proof_of_work"

# VALID_FOLDERS = [
#     "crowd_detection",
#     "entry_exit_detection",
#     "intruder_detection",
#     "invigilator_detection",
#     "invigilator_tracking",
#     "phone_detection",
#     "proximity_detection",
#     "server_room_detection",
#     "crowd_det_zero",
#     "crowd_detection_threshold"
# ]

# SHIFTS = ["shift1", "shift2", "shift3"]

# timestamp_pattern = re.compile(r'_(\d{8})_(\d{6})_')


# def get_shift(time_str):

#     t = datetime.strptime(time_str, "%H%M%S").time()

#     if datetime.strptime("09:00:00","%H:%M:%S").time() <= t <= datetime.strptime("10:30:00","%H:%M:%S").time():
#         return "shift1"

#     if datetime.strptime("12:30:00","%H:%M:%S").time() <= t <= datetime.strptime("14:00:00","%H:%M:%S").time():
#         return "shift2"

#     if datetime.strptime("16:00:00","%H:%M:%S").time() <= t <= datetime.strptime("17:30:00","%H:%M:%S").time():
#         return "shift3"

#     return None


# def create_base_structure(today_folder):

#     for shift in SHIFTS:
#         for folder in VALID_FOLDERS:
#             os.makedirs(os.path.join(today_folder, shift, folder), exist_ok=True)


# def main():

#     if len(sys.argv) > 1:
#         date_input = sys.argv[1]   # format: YYYY-MM-DD
#         dt = datetime.strptime(date_input, "%Y-%m-%d")
#     else:
#         dt = datetime.now()

#     today_date = dt.strftime("%Y-%m-%d")
#     today_str = dt.strftime("%Y%m%d")

#     today_folder = os.path.join(DEST_ROOT, today_date)

#     create_base_structure(today_folder)

#     for folder in VALID_FOLDERS:

#         src_folder = os.path.join(SOURCE_ROOT, folder)

#         if not os.path.exists(src_folder):
#             continue

#         print(f"Processing {folder}")

#         for root, dirs, files in os.walk(src_folder):

#             for file in files:

#                 if not file.lower().endswith((".jpg",".jpeg",".png")):
#                     continue

#                 match = timestamp_pattern.search(file)

#                 if not match:
#                     continue

#                 date_str = match.group(1)
#                 time_str = match.group(2)

#                 # Only today's images
#                 if date_str != today_str:
#                     continue

#                 shift = get_shift(time_str)

#                 if shift is None:
#                     continue

#                 src = os.path.join(root,file)
#                 dst = os.path.join(today_folder,shift,folder,file)

#                 shutil.copy2(src,dst)

#     print("\n✅ Proof of work created for today")


# if __name__ == "__main__":
#     main()











#test
import os
import shutil
import re
import sys
from datetime import datetime

SOURCE_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/tcs_detections"
DEST_ROOT = "/home/suvam/projects/cctv/cctv-analytics-system/results/proof_of_work"

VALID_FOLDERS = [
    "crowd_detection",
    "entry_exit_detection",
    "intruder_detection",
    "invigilator_detection",
    "phone_detection",
    "proximity_detection",
    "server_room_detection"
]

SHIFTS = ["shift1", "shift2", "shift3"]

# timestamp_pattern = re.compile(r'_(\d{8})_(\d{6})_')
timestamp_pattern = re.compile(r'(\d{8})_(\d{6})')


def get_shift(time_str):

    t = datetime.strptime(time_str, "%H%M%S").time()

    if datetime.strptime("09:00:00","%H:%M:%S").time() <= t <= datetime.strptime("10:30:00","%H:%M:%S").time():
        return "shift1"

    if datetime.strptime("12:30:00","%H:%M:%S").time() <= t <= datetime.strptime("14:00:00","%H:%M:%S").time():
        return "shift2"

    if datetime.strptime("16:00:00","%H:%M:%S").time() <= t <= datetime.strptime("17:30:00","%H:%M:%S").time():
        return "shift3"

    return None


def create_base_structure(today_folder):

    for shift in SHIFTS:
        for folder in VALID_FOLDERS:
            os.makedirs(os.path.join(today_folder, shift, folder), exist_ok=True)


def main():

    if len(sys.argv) > 1:
        date_input = sys.argv[1]   # format: YYYY-MM-DD
        dt = datetime.strptime(date_input, "%Y-%m-%d")
    else:
        dt = datetime.now()

    today_date = dt.strftime("%Y-%m-%d")
    today_str = dt.strftime("%Y%m%d")

    today_folder = os.path.join(DEST_ROOT, today_date)

    create_base_structure(today_folder)

    for folder in VALID_FOLDERS:

        src_folder = os.path.join(SOURCE_ROOT, folder)

        if not os.path.exists(src_folder):
            continue

        print(f"Processing {folder}")

        for root, dirs, files in os.walk(src_folder):

            for file in files:

                if not file.lower().endswith((".jpg",".jpeg",".png")):
                    continue

                match = timestamp_pattern.search(file)

                if not match:
                    continue

                date_str = match.group(1)
                time_str = match.group(2)

                # Only today's images
                if date_str != today_str:
                    continue

                shift = get_shift(time_str)

                if shift is None:
                    continue

                # src = os.path.join(root,file)
                # dst = os.path.join(today_folder,shift,folder,file)

                # shutil.copy2(src,dst)
                src = os.path.join(root, file)

                dst_folder = os.path.join(today_folder, shift, folder)

                os.makedirs(dst_folder, exist_ok=True)

                dst = os.path.join(dst_folder, file)

                shutil.copy2(src, dst)

    print("\n✅ Proof of work created for today")


if __name__ == "__main__":
    main()