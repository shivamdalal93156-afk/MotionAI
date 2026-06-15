import sys
from rembg import remove
from PIL import Image

if __name__ == "__main__":
    input_path = sys.argv[1]
    output_path = sys.argv[2]

    input_image = Image.open(input_path).convert("RGBA")
    output_image = remove(input_image)
    output_image.save(output_path, "PNG")