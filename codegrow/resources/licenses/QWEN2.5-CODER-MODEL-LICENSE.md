## Diverse: Rich Model Sizes

This time, Qwen2.5-Coder has open-sourced a rich variety of model sizes, including 0.5B/1.5B/3B/7B/14B/32B, which not only meets the needs of developers in different resource scenarios but also provides a good experimental platform for the research community. The following table provides detailed model information:

|  Models  | Params | Non-Emb Params | Layers | Heads (KV) | Tie Embedding | Context Length | License |
| :--------| :--------: | :--------: | :------: | :------------: | :-------: | :------------: | :-------: |
| Qwen2.5-Coder-0.5B |  0.49B |  0.36B | 24 | 14 / 2 | Yes |  32K | Apache 2.0 |
| Qwen2.5-Coder-1.5B | 1.54B |  1.31B | 28 | 12 / 2 | Yes |  32K | Apache 2.0 |
| Qwen2.5-Coder-3B  |  3.09B |  2.77B | 36 | 16 / 2 | Yes |  32K | Qwen Research |
| Qwen2.5-Coder-7B | 7.61B |  6.53B | 28 | 28 / 4 | No |  128K | Apache 2.0 |
| Qwen2.5-Coder-14B | 14.7B |  13.1B | 48 | 40 / 8 | No |  128K  | Apache 2.0 |
| Qwen2.5-Coder-32B  |  32.5B |  31.0B | 64 | 40 / 8 | No |  128K | Apache 2.0 |

We have always believed in the philosophy of Scaling Law. We evaluated the performance of different sizes of Qwen2.5-Coder across all datasets to verify the effectiveness of Scaling in Code LLMs. For each size, we open-sourced both Base and Instruct models, where the Instruct model serves as an official aligned model that can chat directly, and the Base model serves as a foundation for developers to fine-tune their own models.

Here are the performances of the Base models of different sizes:
{{< figure src="https://qianwen-res.oss-cn-beijing.aliyuncs.com/Qwen2.5/Qwen2.5-Coder-Family/qwen2.5-coder-family-base.png#center" width="100%">}}
## Model License

Qwen2.5-Coder 0.5B / 1.5B / 7B / 14B / 32B are licensed under **Apache 2.0**, while 3B is under Qwen-Research license;

